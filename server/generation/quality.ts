import type { DocumentProject, ReviewIssue } from '../../shared/document';
import { auditProject } from '../../shared/integrity';
import { ApiError } from '../auth';

export function uniqueIssues(issues:ReviewIssue[]):ReviewIssue[] {
  const seen=new Set<string>();
  return issues.filter(issue=>{
    const key=JSON.stringify([issue.severity,issue.message,issue.blockId,issue.page]);
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
export function repairableIssues(issues:ReviewIssue[]):ReviewIssue[] {
  return issues.filter(issue=>issue.severity==='error'||(issue.severity==='warning'&&!!(issue.page||issue.blockId)));
}
export function issueScore(issues:ReviewIssue[]):number {
  return issues.reduce((sum,issue)=>sum+(issue.severity==='error'?100:issue.severity==='warning'?10:0),0);
}
export function ensureGenerationInput(project:DocumentProject) {
  if(!project.source?.blocks.length)throw new ApiError(422,'Importe um documento para iniciar a diagramação.');
  if(project.source.blocks.length>2000)throw new ApiError(422,'Divida a origem em volumes de até 2.000 componentes para gerar e conferir cada parte.');
  const meaningful=project.source.blocks.some(block=>block.text.trim()||block.rows.some(row=>row.some(cell=>cell.trim()))||block.image);
  if(!meaningful)throw new ApiError(422,'A origem não contém texto, tabelas ou imagens para diagramar.');
  const textSize=project.source.blocks.reduce((size,block)=>size+block.text.length+
    block.rows.flat().join('').length+block.items.map(item=>item.title+item.text).join('').length,0);
  if(textSize>240_000)throw new ApiError(422,'O documento é muito extenso para uma geração. Divida-o em volumes.');
}
export function ensureGeneratedIntegrity(project:DocumentProject) {
  const errors=auditProject(project).filter(issue=>issue.severity==='error');
  if(errors.length)throw new ApiError(422,'A conferência identificou divergências no conteúdo. Nenhuma versão parcial foi aplicada.');
}
export function throwIfAborted(signal?:AbortSignal) {
  if(signal?.aborted)throw new ApiError(499,'A geração foi cancelada. O documento anterior foi preservado.');
}
