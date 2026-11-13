import {z} from 'zod';
import {projectSchema,type DocumentProject,type ReviewIssue} from '../../shared/document';
import type {GenerateOptions} from '../../shared/generation';
import {AIError,requestStructured} from './client';
import {semanticReviewPrompt} from './prompts';
import {meaningSchema} from './schemas';
import {sourceBatches,inputBlock,checkCancelled} from './source';
const response=z.object({issues:z.array(z.object({severity:z.enum(['error','warning']),
  blockId:z.string().max(120),message:z.string().min(1).max(2000),
}).strict()).max(100)}).strict();
export function validateMeaningReview(raw:unknown,knownIds:Set<string>):ReviewIssue[] {
  const parsed=response.safeParse(raw);
  if(!parsed.success||parsed.data.issues.some(issue=>issue.blockId&&!knownIds.has(issue.blockId)))
    throw new AIError('A conferência editorial retornou uma referência inválida.',502,'meaning_review');
  return parsed.data.issues.map(issue=>({...issue,blockId:issue.blockId||undefined}));
}
export async function reviewDocumentMeaning(input:DocumentProject,options:GenerateOptions={}):Promise<ReviewIssue[]> {
  const project=projectSchema.parse(input);
  if(project.mode==='integral'||!project.source?.blocks.length)return [];
  const batches=sourceBatches(project.source.blocks);const issues:ReviewIssue[]=[];
  const known=new Set(project.blocks.map(block=>block.id));
  for(let index=0;index<batches.length;index++){
    checkCancelled(options.signal);
    options.onProgress?.({stage:'review',message:'Conferindo requisitos, exceções e informações com a origem…',current:index+1,total:batches.length});
    const originals=batches[index];const ids=new Set(originals.map(block=>block.id));
    const output=project.blocks.filter(block=>block.sourceIds.some(id=>ids.has(id))).map(inputBlock);
    const raw=await requestStructured('editorial_fidelity_review',meaningSchema,[
      {role:'system',content:semanticReviewPrompt},
      {role:'user',content:JSON.stringify({title:project.title,source:originals.map(inputBlock),publication:output,
        scope:'Confira apenas os trechos da fonte enviados. Um componente pode citar outros sourceIds de lotes adjacentes; não suponha que esses trechos estejam ausentes do documento completo.'})},
    ],options.signal,10000,'high');
    issues.push(...validateMeaningReview(raw,known));
  }
  const unique=new Map(issues.map(issue=>[`${issue.blockId||''}:${issue.message}`,issue]));
  return [...unique.values()];
}
