import { Check, LoaderCircle, ScanText, Blocks, LayoutTemplate, BookOpenCheck, Shapes, WandSparkles,
  AlertCircle, FileCheck2 } from 'lucide-react';
import type { GenerationProgress, QualityReport } from '../../shared/generation';
const stages=[
  {id:'analyze',label:'Entendimento',icon:ScanText},{id:'plan',label:'Plano editorial',icon:Blocks},
  {id:'compose',label:'Composição',icon:Shapes},{id:'paginate',label:'Paginação',icon:LayoutTemplate},
  {id:'review',label:'Conferência',icon:BookOpenCheck},{id:'refine',label:'Refinamento',icon:WandSparkles},
] as const;
export function GenerationStatus({progress,busy}: {progress:GenerationProgress;busy:boolean}) {
  const visited=new Set(progress.visitedStages||[progress.stage]);
  const finished=progress.stage==='complete';
  const counted=progress.current!==undefined&&progress.total!==undefined;
  return <section className="dg-generation-status" aria-label="Acompanhamento da geração" aria-live="polite">
    <div className="dg-generation-message"><span>{busy?<LoaderCircle className="dg-spin" size={15}/>:<FileCheck2 size={15}/>}</span>
      <strong>{progress.message}</strong>{counted&&<output>{progress.current} de {progress.total}</output>}</div>
    <ol className="dg-generation-stages">{stages.map(stage=>{
      const Icon=stage.icon;const active=stage.id===progress.stage;
      const completed=visited.has(stage.id)&&!active;const skipped=finished&&!visited.has(stage.id);
      return <li key={stage.id} className={completed?'is-done':active?'is-current':skipped?'is-skipped':''}
        aria-current={active?'step':undefined}>
        <span>{completed?<Check size={12}/>:<Icon size={13}/>}</span><small>{stage.label}{stage.id==='refine'&&!visited.has('refine')?<em>opcional</em>:null}</small></li>;
    })}</ol>
  </section>;
}
export function QualitySummary({report,onIssues}: {report:QualityReport;onIssues:()=>void}) {
  const errors=report.issues.filter(issue=>issue.severity==='error').length;
  const warnings=report.issues.filter(issue=>issue.severity==='warning').length;
  const pending=report.status==='needs-review';
  return <section className={`dg-quality-summary ${pending?'has-warnings':''}`} aria-label="Resultado da conferência">
    <div className="dg-quality-title">{pending?<AlertCircle size={17}/>:<FileCheck2 size={17}/>}<strong>
      {pending?'Conferência com apontamentos':'Conferência concluída'}</strong></div>
    <dl><div><dt>Páginas compostas</dt><dd>{report.pages}</dd></div>
      <div><dt>Páginas revistas visualmente</dt><dd>{report.visualPages}</dd></div>
      <div><dt>Ciclos de conferência</dt><dd>{report.passes}</dd></div></dl>
    <p>{report.wordValidation==='available'?'Word renderizado e conferido.':report.wordValidation==='failed'?'A conferência do Word não foi concluída. Consulte os apontamentos.':'A conferência visual do Word não está disponível neste servidor.'}</p>
    <button type="button" className="dg-text-button" onClick={onIssues}>
      {errors?`${errors} erro(s) · `:''}{warnings?`${warnings} observação(ões)`:'Consultar apontamentos'}</button>
    <small>{new Date(report.reviewedAt).toLocaleString('pt-BR')}</small>
  </section>;
}
