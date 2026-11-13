import { z } from 'zod';
import { authorizeProcessing } from './storage';
import { projectSchema, sourceSchema, type DocumentProject, type ReviewIssue } from '../../shared/document';
import type { GenerationProgress, GenerationResult, QualityReport } from '../../shared/generation';
export class ProcessingError extends Error {}
async function send(path: string, body: unknown, signal?: AbortSignal) {
  const { token } = await authorizeProcessing();
  signal?.throwIfAborted();
  const form = body instanceof FormData;
  const response = await fetch(`/api/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, ...(!form ? {'Content-Type':'application/json'} : {}) },
    body: form ? body : JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ProcessingError(typeof error.error === 'string' ? error.error : 'Não foi possível concluir a operação.');
  }
  return response;
}
export async function fetchAiStatus() {
  const response = await fetch('/api/status', { cache:'no-store' });
  if (!response.ok) throw new ProcessingError('Não foi possível consultar o servidor.');
  let body:unknown;
  try { body=await response.json(); }
  catch { throw new ProcessingError('O servidor de processamento não respondeu. Atualize a aplicação e tente novamente.'); }
  const parsed=z.object({data:z.object({configured:z.boolean(),model:z.string()})}).safeParse(body);
  if(!parsed.success)throw new ProcessingError('Não foi possível confirmar a configuração do processamento.');
  return parsed.data.data;
}
export async function uploadDocument(file: File, signal?: AbortSignal) {
  const form = new FormData(); form.append('file', file);
  const response = await send('import', form, signal);
  return sourceSchema.parse((await response.json()).data);
}
const progressSchema = z.object({
  stage:z.enum(['analyze','plan','compose','paginate','review','refine','complete']),
  message:z.string().min(1).max(2000),current:z.number().int().nonnegative().optional(),
  total:z.number().int().nonnegative().optional(),
}).strict();
const issueSchema = z.object({severity:z.enum(['error','warning','info']),message:z.string().max(3000),
  blockId:z.string().max(120).optional(),page:z.number().int().positive().optional()}).strict();
const resultSchema = z.object({project:projectSchema,report:z.object({
  pages:z.number().int().nonnegative(),passes:z.number().int().nonnegative(),
  visualPages:z.number().int().nonnegative(),issues:z.array(issueSchema).max(6000),
  status:z.enum(['reviewed','needs-review']),wordValidation:z.enum(['available','unavailable','failed']),
  reviewedAt:z.string().datetime(),
}).strict()}).strict();

/** Reads real SSE stages; an interrupted stream never becomes a generated document. */
export async function readGenerationStream(
  response:Response,signal?:AbortSignal,onProgress?:(progress:GenerationProgress)=>void,
):Promise<GenerationResult> {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new ProcessingError('O servidor não iniciou o acompanhamento da geração.');
  const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';
  const visitedStages=new Set<GenerationProgress['stage']>();
  function frame(value:string):GenerationResult|undefined {
    let event='message';const data:string[]=[];
    for(const line of value.split(/\r?\n/)) {
      if(line.startsWith('event:'))event=line.slice(6).trim();
      if(line.startsWith('data:'))data.push(line.slice(5).trimStart());
    }
    if(!data.length)return;
    let payload:unknown;
    try { payload=JSON.parse(data.join('\n')); }
    catch { throw new ProcessingError('O servidor enviou um evento de geração inválido.'); }
    if(event==='progress') {
      const parsed=progressSchema.safeParse(payload);
      if(!parsed.success)throw new ProcessingError('O acompanhamento da geração retornou dados inválidos.');
      if(parsed.data.total!==undefined&&parsed.data.current!==undefined&&parsed.data.current>parsed.data.total)
        throw new ProcessingError('O acompanhamento da geração retornou uma contagem inválida.');
      visitedStages.add(parsed.data.stage);
      onProgress?.({...parsed.data,visitedStages:[...visitedStages]});return;
    }
    if(event==='result') {
      const parsed=resultSchema.safeParse(payload);
      if(!parsed.success)throw new ProcessingError('O documento gerado não passou pela validação de estrutura.');
      return parsed.data;
    }
    if(event==='error') {
      const error=z.object({error:z.string().max(2000)}).safeParse(payload);
      throw new ProcessingError(error.success?error.data.error:'A geração foi interrompida pelo servidor.');
    }
    throw new ProcessingError('O servidor retornou um evento de geração não reconhecido.');
  }
  try {
    while(true) {
      signal?.throwIfAborted();
      const chunk=await reader.read();
      pending+=decoder.decode(chunk.value,{stream:!chunk.done});
      if(pending.length>40*1024*1024)throw new ProcessingError('A resposta da geração excedeu o limite de conteúdo.');
      let separator:RegExpExecArray|null;
      while((separator=/\r?\n\r?\n/.exec(pending))) {
        const result=frame(pending.slice(0,separator.index));
        pending=pending.slice(separator.index+separator[0].length);
        if(result)return result;
      }
      if(chunk.done)break;
    }
    throw new ProcessingError('A geração foi interrompida antes da entrega do documento. O conteúdo anterior foi preservado.');
  } finally {
    await reader.cancel().catch(()=>undefined);reader.releaseLock();
  }
}
export async function generateProject(
  project:DocumentProject,instructions:string,signal?:AbortSignal,onProgress?:(progress:GenerationProgress)=>void,
):Promise<GenerationResult> {
  const response=await send('generate/stream',{project,instructions},signal);
  return readGenerationStream(response,signal,onProgress);
}
export async function reviewProject(project: DocumentProject, signal?: AbortSignal): Promise<QualityReport> {
  const response = await send('review', { project, visual:true }, signal);
  return resultSchema.shape.report.parse((await response.json()).data.report);
}
export async function downloadDocument(project: DocumentProject, format: 'pdf'|'docx', signal?: AbortSignal) {
  const response = await send(`export/${format}`, { project }, signal);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a'); anchor.href=url;
  anchor.download = `${project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').slice(0,120)||'Documento'}.${format}`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  const warning=response.headers.get('X-Diagrama-Warning');
  if (!warning) return undefined;
  try { return decodeURIComponent(warning); } catch { return warning; }
}
