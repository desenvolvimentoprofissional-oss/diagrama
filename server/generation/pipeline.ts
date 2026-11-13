import type { DocumentProject, ReviewIssue } from '../../shared/document';
import type { GenerateOptions, GenerationResult, QualityReport } from '../../shared/generation';
import { auditProject } from '../../shared/integrity';
import { normalizeSource,inferDocumentMetadata } from '../../shared/structure';
import { planDocument,composeDocument,repairDocument,reviewDocumentMeaning } from '../ai';
import { inspectDocument } from '../export/browser';
import { proofWord,wordRendererStatus } from '../export/word-proof';
import { validatedProject } from '../validation';
import { ApiError } from '../auth';
import { ensureGeneratedIntegrity,ensureGenerationInput,issueScore,repairableIssues,throwIfAborted,uniqueIssues } from './quality';
import { reviewAllPages } from './visual';
let active=0;
const MAX_PASSES=2;

type Candidate={project:DocumentProject;report:QualityReport;images:{page:number;image:string}[]};
export async function generateDocument(input:DocumentProject,instructions='',options:GenerateOptions={}):Promise<GenerationResult> {
  if(active>=1)throw new ApiError(429,'Há uma geração em andamento neste servidor. Aguarde antes de iniciar outra.');
  active++;
  const deadline=AbortSignal.timeout(540000);
  const signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  try {return await runGeneration(validatedProject(input),instructions,{...options,signal});}
  catch(error){if(deadline.aborted&&!options.signal?.aborted)throw new ApiError(504,
    'A geração ultrapassou o prazo de nove minutos. Divida o documento em partes e tente novamente.');throw error;}
  finally {active--;}
}
async function runGeneration(project:DocumentProject,instructions:string,options:GenerateOptions):Promise<GenerationResult> {
  const startedAt=Date.now();
  ensureGenerationInput(project);throwIfAborted(options.signal);
  const source=normalizeSource(project.source!);
  const degenerate=/^(?:cap[ií]tulo|anexo|sum[aá]rio|documento sem t[ií]tulo)\b/iu.test(project.title);
  project={...project,source,blocks:structuredClone(source.blocks),
    ...(degenerate?inferDocumentMetadata(source):{})};
  options.onProgress?.({stage:'analyze',message:'Analisando a finalidade, a estrutura e o conteúdo completo.'});
  const plan=await planDocument(project,instructions,options);
  let candidate=await composeDocument(project,plan,instructions,options);
  let best:Candidate|undefined;
  let cycles=0;
  const wordAvailable=await wordRendererStatus();
  for(let pass=0;pass<=MAX_PASSES;pass++) {
    throwIfAborted(options.signal);ensureGeneratedIntegrity(candidate);
    const cycleStarted=Date.now();
    const inspected=await inspectCandidate(candidate,pass,options,wordAvailable,plan.cautions);
    const cycleDuration=Date.now()-cycleStarted;
    cycles++;
    if(!best||issueScore(inspected.report.issues)<issueScore(best.report.issues))best=inspected;
    const corrections=repairableIssues(inspected.report.issues);
    if(!corrections.length||pass===MAX_PASSES)break;
    if(540000-(Date.now()-startedAt)<cycleDuration+60000)break;
    options.onProgress?.({stage:'refine',message:`Ajustando ${corrections.length} apontamentos de composição e conteúdo.`,
      current:pass+1,total:MAX_PASSES});
    const selectedPages=new Set(corrections.map(issue=>issue.page).filter(Boolean));
    const references=inspected.images.filter(image=>selectedPages.has(image.page)).slice(0,6);
    const repaired=validatedProject(await repairDocument(candidate,corrections,references,instructions,options));
    if(JSON.stringify([candidate.title,candidate.subtitle,candidate.blocks,candidate.theme])===
      JSON.stringify([repaired.title,repaired.subtitle,repaired.blocks,repaired.theme]))break;
    candidate=repaired;
  }
  if(!best)throw new ApiError(500,'Não foi possível conferir o documento gerado.');
  const report:QualityReport={...best.report,passes:cycles,reviewedAt:new Date().toISOString()};
  options.onProgress?.({stage:'complete',message:report.status==='reviewed'?'Documento gerado e conferido.':
    'Documento gerado. Consulte os apontamentos restantes antes de publicar.'});
  return {project:best.project,report};
}
async function inspectCandidate(project:DocumentProject,pass:number,options:GenerateOptions,wordAvailable:boolean,cautions:string[]=[]):Promise<Candidate> {
  options.onProgress?.({stage:'paginate',message:'Medindo as páginas, os elementos e a continuidade do conteúdo.'});
  const rendered=await inspectDocument(project);
  throwIfAborted(options.signal);
  options.onProgress?.({stage:'review',message:'Conferindo sentido, requisitos, números e referências com o original.'});
  const meaning=project.source?.blocks.length?await reviewDocumentMeaning(project,options):[];
  const visual=await reviewAllPages(project,rendered.images,options);
  const wordIssues:ReviewIssue[]=[];
  let wordImages:{page:number;image:string}[]=[];
  let wordCompleted=false;
  if(wordAvailable) {
    options.onProgress?.({stage:'review',message:'Renderizando e conferindo o arquivo Word editável.'});
    throwIfAborted(options.signal);
    const word=await proofWord(project,options.signal);throwIfAborted(options.signal);wordIssues.push(...word.issues);
    wordCompleted=word.completed;
    if(word.completed&&word.images?.length) {
      wordImages=word.images;
      wordIssues.push(...await reviewAllPages(project,wordImages,options,'Word'));
    }
  } else wordIssues.push({severity:'warning',message:'A conferência visual do Word requer LibreOffice no servidor. O PDF foi conferido separadamente.'});
  const issues=uniqueIssues([...auditProject(project),...cautions.map(message=>({severity:'warning' as const,message})),
    ...rendered.issues,...meaning,...visual,...wordIssues]);
  return {project,images:[...rendered.images,...wordImages],report:{pages:rendered.pages,passes:pass+1,visualPages:rendered.images.length,
    issues,status:repairableIssues(issues).length||!wordCompleted?'needs-review':'reviewed',
    wordValidation:!wordAvailable?'unavailable':wordCompleted?'available':'failed',reviewedAt:new Date().toISOString()}};
}

export async function reviewDocument(project:DocumentProject,options:GenerateOptions={}):Promise<GenerationResult> {
  throwIfAborted(options.signal);
  const candidate=await inspectCandidate(validatedProject(project),0,options,await wordRendererStatus());
  return {project:candidate.project,report:candidate.report};
}
