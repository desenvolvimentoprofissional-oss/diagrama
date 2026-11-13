import { z } from 'zod';
import {projectSchema,type DocumentBlock,type DocumentProject} from '../../shared/document';
import type {GenerateOptions} from '../../shared/generation';
import {AIError,requestStructured} from './client';
import {editorialSchema,digestSchema} from './schemas';
import {planningPrompt,editorialPrinciples} from './prompts';
import {referenceImages} from './reference';
import {checkCancelled,inputBlock,requireSource,sourceBatches} from './source';
import {validateEditorialPlan,type EditorialPlan} from './contracts';
const digest=z.object({titleCandidate:z.string().max(300),summary:z.string().max(6000),
  groups:z.array(z.object({sourceIds:z.array(z.string()).min(1),title:z.string().max(300),
    meaning:z.string().max(5000),conditions:z.array(z.string().max(2000)).max(100),relationship:z.string().max(1500),
  }).strict()).min(1).max(100),
}).strict();
export function validateDigest(raw:unknown,source:DocumentBlock[]) {
  const parsed=digest.safeParse(raw);
  const known=new Set(source.map(block=>block.id));
  const ids=parsed.success?parsed.data.groups.flatMap(group=>group.sourceIds):[];
  if(!parsed.success||ids.length!==known.size||new Set(ids).size!==known.size||ids.some(id=>!known.has(id)))
    throw new AIError('A análise global não confirmou todos os trechos da origem.',502,'analysis_coverage');
  return parsed.data;
}
async function wholeDocumentContext(source:DocumentBlock[],options:GenerateOptions) {
  const complete=JSON.stringify(source.map(inputBlock));
  if(complete.length<=220000)return {completeSource:source.map(inputBlock)};
  const batches=sourceBatches(source);const digests=[];
  for(let i=0;i<batches.length;i++){
    checkCancelled(options.signal);
    options.onProgress?.({stage:'analyze',message:'Analisando o significado e as relações de toda a origem…',current:i+1,total:batches.length});
    const raw=await requestStructured('editorial_source_analysis',digestSchema,[
      {role:'system',content:`${editorialPrinciples}\nAnalise este lote para o planejamento global. Cubra cada sourceId exatamente uma vez.
Agrupe assuntos próximos e descreva seu significado, condições e relações, mantendo exceções, responsáveis, prazos e custos.
Esta análise não é a publicação final: cada trecho será relido durante a composição. Não omita anexos ou tabelas.`},
      {role:'user',content:JSON.stringify({batch:i+1,totalBatches:batches.length,source:batches[i].map(inputBlock)})},
    ],options.signal,16000,'medium');
    digests.push(validateDigest(raw,batches[i]));
  }
  const context={sourceAnalyses:digests,inventory:source.map(block=>({id:block.id,kind:block.kind,
    level:block.level,title:block.kind==='heading'?block.text:'',length:block.text.length}))};
  if(JSON.stringify(context).length>650000)
    throw new AIError('A análise global excedeu o limite de contexto. Divida o documento em volumes para manter a precisão.',422,'global_context');
  return context;
}
export async function planDocument(input:DocumentProject,instructions='',options:GenerateOptions={}):Promise<EditorialPlan> {
  const project=projectSchema.parse(input);const source=requireSource(project,instructions);
  checkCancelled(options.signal);
  options.onProgress?.({stage:'analyze',message:'Lendo finalidade, públicos, condições e relações do documento…'});
  const context=await wholeDocumentContext(source,options);
  const images=await referenceImages();
  options.onProgress?.({stage:'plan',message:'Definindo o projeto editorial completo com o padrão institucional aprovado…'});
  let correction='';
  for(let attempt=0;attempt<2;attempt++){
    const raw=await requestStructured('institutional_editorial_plan',editorialSchema,[
      {role:'system',content:planningPrompt},
      {role:'user',content:[{type:'input_text',text:JSON.stringify({mode:project.mode,
        filename:project.source!.name,currentTitle:project.title,currentStyle:{primary:project.theme.primary,accent:project.theme.accent,
          fontSize:project.theme.fontSize,organization:project.theme.organization,cover:project.cover,toc:project.toc},
        hasCustomLogo:Boolean(project.theme.logo),instructions,context,validationCorrection:correction})},...images]},
    ],options.signal,24000,'high');
    try{return validateEditorialPlan(raw,source,project.mode==='integral');}
    catch(error){if(!(error instanceof AIError)||attempt===1)throw error;correction=error.message;}
  }
  throw new AIError('Não foi possível concluir o projeto editorial.',502,'editorial_structure');
}
export type {EditorialPlan} from './contracts';
