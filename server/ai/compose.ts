import {projectSchema,type DocumentBlock,type DocumentProject} from '../../shared/document';
import type {GenerateOptions} from '../../shared/generation';
import {auditProject} from '../../shared/integrity';
import {AIError,requestStructured} from './client';
import {explanatorySchema,integralPlanSchema} from './schemas';
import {compositionPrompt,integralPrompt} from './prompts';
import {inputBlock,checkCancelled,requireSource,sourceBatches} from './source';
import {validateEditorialPlan,type EditorialPlan} from './contracts';
import {applyExplanation,applyIntegralPlan} from './composition-contracts';

export function carriesPlannedVisual(blocks:DocumentBlock[],section:EditorialPlan['sections'][number]):boolean {
  const visual=section.visual;
  if(visual==='none')return true;
  if(visual==='comparison')return blocks.some(block=>block.kind==='table');
  if(visual==='cards')return blocks.some(block=>block.kind==='cards');
  const graphs=blocks.filter(block=>block.kind==='diagram'&&block.layout===visual);
  const evidence=new Set(graphs.flatMap(block=>(block.nodes||[]).flatMap(node=>node.sourceIds)));
  return graphs.length>0&&section.visualSourceIds.every(id=>evidence.has(id));
}
export function plannedStyle(project:DocumentProject,plan:EditorialPlan,instructions:string):Partial<DocumentProject> {
  const style=instructions.trim()&&plan.style?.customized?plan.style:undefined;
  return style?{theme:{...project.theme,primary:style.primary,accent:style.accent,fontSize:style.fontSize,
    organization:style.organization},cover:style.cover,toc:style.toc}:{};
}
export async function composeDocument(input:DocumentProject,rawPlan:EditorialPlan,instructions='',options:GenerateOptions={}):Promise<DocumentProject> {
  const project=projectSchema.parse(input);const source=requireSource(project,instructions);
  const plan=validateEditorialPlan(rawPlan,source,project.mode==='integral');
  const byId=new Map(source.map(block=>[block.id,block]));
  const tasks=plan.sections.flatMap(section=>sourceBatches(section.sourceIds.map(id=>byId.get(id)!))
    .map((batch,index)=>({section,batch,first:index===0})));
  const controller=new AbortController();
  const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
  const assembled:DocumentBlock[][]=Array.from({length:tasks.length},()=>[]);
  let cursor=0,completed=0;
  async function composeTask(index:number){
    checkCancelled(signal);
    const {section,batch,first}=tasks[index];
    options.onProgress?.({stage:'compose',message:`Compondo ${section.title}…`,current:completed,total:tasks.length});
    const visualEvidence=first&&project.mode==='explanatory'?section.visualSourceIds.map(id=>byId.get(id)!):[];
    const allowed=[...new Map([...batch,...visualEvidence].map(block=>[block.id,block])).values()];
    let correction='';let result:DocumentBlock[]=[];
    for(let attempt=0;attempt<2;attempt++){
      const raw=await requestStructured(project.mode==='integral'?'integral_layout':'institutional_document_composition',
        project.mode==='integral'?integralPlanSchema:explanatorySchema,[
          {role:'system',content:project.mode==='integral'?integralPrompt:compositionPrompt},
          {role:'user',content:JSON.stringify({instructions,plan,section,firstBatchOfSection:first,
            requiredVisual:first?section.visual:'none',source:batch.map(inputBlock),visualEvidence:visualEvidence.map(inputBlock),
            batch:index+1,totalBatches:tasks.length,validationCorrection:correction})},
        ],signal,project.mode==='integral'?14000:28000,'medium');
      try{
        result=project.mode==='integral'?applyIntegralPlan(raw,batch):applyExplanation(raw,allowed,batch);
        if(first&&project.mode==='explanatory'&&!carriesPlannedVisual(result,section))
          throw new AIError('A composição não realizou a visualização justificada no projeto editorial.',502,'planned_visual');
        break;
      }catch(error){if(!(error instanceof AIError)||attempt===1)throw error;correction=error.message;}
    }
    assembled[index]=result;completed++;
    options.onProgress?.({stage:'compose',message:`Seção composta: ${section.title}.`,current:completed,total:tasks.length});
  }
  async function worker(){while(cursor<tasks.length)await composeTask(cursor++);}
  try{await Promise.all(Array.from({length:Math.min(2,tasks.length)},()=>worker()));}
  catch(error){controller.abort();throw error;}
  const output=assembled.flat();
  const result=projectSchema.parse({...project,title:plan.title,subtitle:plan.subtitle,blocks:output,
    ...plannedStyle(project,plan,instructions),
    updatedAt:new Date().toISOString()});
  if(auditProject(result).some(issue=>issue.severity==='error'))
    throw new AIError('A conferência de integridade identificou divergências. Nenhuma alteração foi aplicada.',502,'integrity');
  return result;
}
