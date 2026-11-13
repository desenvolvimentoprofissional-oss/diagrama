import { z } from 'zod';
import type { DocumentBlock } from '../../shared/document';
import { AIError } from './client';
export const editorialPlanSchema=z.object({
  title:z.string().min(1).max(300),subtitle:z.string().max(1000),
  documentType:z.enum(['regulation','report','guide','proposal','general']),
  purpose:z.string().min(1).max(2000),audience:z.string().min(1).max(1000),
  synopsis:z.string().min(1).max(6000),organization:z.string().min(1).max(4000),
  sections:z.array(z.object({id:z.string().min(1).max(80),title:z.string().min(1).max(240),
    summary:z.string().min(1).max(2000),sourceIds:z.array(z.string().max(120)).min(1).max(6000),
    visual:z.enum(['none','process','decision','comparison','timeline','hierarchy','cards']),
    visualPurpose:z.string().max(1000),visualSourceIds:z.array(z.string().max(120)).max(100).default([]),headingLevel:z.number().int().min(1).max(3),
  }).strict()).min(1).max(150),
  style:z.object({customized:z.boolean(),primary:z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),fontSize:z.number().min(9).max(14),
    organization:z.string().min(1).max(200),cover:z.boolean(),toc:z.boolean(),reason:z.string().max(1000),
  }).strict().optional(),
  cautions:z.array(z.string().max(2000)).max(100),
}).strict();
export type EditorialPlan=z.infer<typeof editorialPlanSchema>;
export function explicitProcedures(source:DocumentBlock[]):{anchorId:string;stepIds:string[]}[] {
  const result:{anchorId:string;stepIds:string[]}[]=[];
  const anchor=/\b(?:seguintes\s+etapas|etapas\s+(?:seguintes|abaixo)|fases\s+do\s+procedimento|obedecer[aã]o\s+(?:[aà]s?\s+)?(?:seguintes\s+)?etapas)\b/iu;
  const ordered=/^\s*(?:[IVXLCDM]+\s*[—–-]|\d+\s*[.)—–-]|[a-z]\s*[)])\s+/iu;
  for(let index=0;index<source.length;index++){
    const first=source[index];if(!anchor.test(first.text))continue;
    const inside=first.text.match(/\b(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[—–-]\s+/gu)||[];
    if(inside.length>=3){result.push({anchorId:first.id,stepIds:[first.id]});continue;}
    const stepIds:string[]=[];
    for(const block of source.slice(index+1,index+21)){
      if(block.kind==='list'||ordered.test(block.text))stepIds.push(block.id);
      else if(block.text.trim())break;
    }
    if(stepIds.length>=3)result.push({anchorId:first.id,stepIds});
  }
  return result;
}
export function validateEditorialPlan(raw:unknown,source:DocumentBlock[],integral=false):EditorialPlan {
  const result=editorialPlanSchema.safeParse(raw);
  if(!result.success)throw new AIError('O projeto editorial retornou uma estrutura inválida.',502,'editorial_structure');
  const plan=result.data;
  if(/^(?:cap[ií]tulo\s+[ivxlcdm\d]+|anexo\s+[ivxlcdm\d]+|sum[aá]rio|documento sem t[ií]tulo)[\s.:-]*$/iu.test(plan.title))
    throw new AIError('O título proposto identifica apenas uma parte do documento. Nenhuma composição foi aplicada.',502,'document_title');
  const ids=plan.sections.flatMap(section=>section.sourceIds);
  const known=new Set(source.map(block=>block.id));
  if(ids.length!==known.size || new Set(ids).size!==known.size || ids.some(id=>!known.has(id)))
    throw new AIError('O projeto editorial não distribuiu toda a origem sem omissões ou duplicações.',502,'editorial_coverage');
  if(new Set(plan.sections.map(section=>section.id)).size!==plan.sections.length)
    throw new AIError('O projeto editorial contém seções repetidas.',502,'editorial_structure');
  if(integral&&ids.some((id,index)=>source[index].id!==id))
    throw new AIError('O projeto editorial alterou a sequência do documento integral.',502,'editorial_order');
  if(plan.sections.some(section=>section.visual!=='none'&&!section.visualPurpose.trim()))
    throw new AIError('Uma visualização foi proposta sem finalidade ligada ao conteúdo.',502,'visual_purpose');
  for(const section of plan.sections){
    if(section.visualSourceIds.some(id=>!section.sourceIds.includes(id)))
      throw new AIError('Uma visualização cita evidência fora de sua seção.',502,'visual_source');
    if(section.visual!=='none'&&!section.visualSourceIds.length)
      throw new AIError('Uma visualização não identifica as evidências necessárias.',502,'visual_source');
  }
  if(!integral){
    const visualized=new Set(plan.sections.filter(section=>['process','decision'].includes(section.visual))
      .flatMap(section=>section.visualSourceIds));
    const pending=explicitProcedures(source).find(procedure=>procedure.stepIds.some(id=>!visualized.has(id)));
    if(pending)throw new AIError(`O procedimento com etapas explícitas em ${pending.anchorId} precisa de fluxo completo, com evidências ${pending.stepIds.join(', ')}.`,502,'procedure_visual');
  }
  return plan;
}
