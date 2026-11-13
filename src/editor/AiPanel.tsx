import { useEffect, useState } from 'react';
import { Sparkles, ArrowUpRight, ShieldCheck, FilePenLine, BadgeCheck } from 'lucide-react';
import type { DocumentProject } from '../../shared/document';
export function AiPanel({ project, busy, configured, onMode, onGenerate,onInstructionsChange }: {
  project: DocumentProject; busy: boolean; configured?: boolean;
  onMode: (mode: DocumentProject['mode']) => void; onGenerate: (instructions: string) => void;
  onInstructionsChange?:(value:string)=>void;
}) {
  const [instructions, setInstructions] = useState('');
  useEffect(() => { setInstructions('');onInstructionsChange?.(''); }, [project.id,onInstructionsChange]);
  return <section className="dg-ai-panel" aria-label="Diagramação com inteligência artificial">
    <div className="dg-ai-title"><Sparkles size={16} /><strong>Assistente editorial</strong><span>GPT</span></div>
    <div className="dg-default-design"><BadgeCheck size={17}/><div><strong>Padrão CRA-SP automático</strong>
      <span>Logo, identidade visual, páginas e infográficos.</span></div></div>
    <div className="dg-mode-control" role="group" aria-label="Modo de diagramação">
      <button type="button" disabled={busy} aria-pressed={project.mode === 'explanatory'}
        className={project.mode === 'explanatory' ? 'is-active' : ''} onClick={() => onMode('explanatory')}>
        <FilePenLine size={13} />Explicativo</button>
      <button type="button" disabled={busy} aria-pressed={project.mode === 'integral'}
        className={project.mode === 'integral' ? 'is-active' : ''} onClick={() => onMode('integral')}>
        <ShieldCheck size={13} />Integral</button>
    </div>
    <p>{project.mode === 'integral' ? 'Mantém a redação e a sequência da origem. Organiza o conteúdo no padrão institucional.' :
      'Planeja e compõe uma versão explicativa, com referências à origem e conferência das páginas.'}</p>
    <details className="dg-custom-instructions">
      <summary>Solicitar algo diferente <span>opcional</span></summary>
      <label htmlFor="dg-ai-instructions">Adaptações para este documento</label>
      <textarea id="dg-ai-instructions" rows={4} maxLength={4000} value={instructions} disabled={busy}
        onChange={event => {setInstructions(event.target.value);onInstructionsChange?.(event.target.value);}} placeholder="Descreva apenas o que deseja mudar no padrão." />
    </details>
    <button type="button" className="dg-button dg-button-ai dg-full" onClick={() => onGenerate(instructions)}
      disabled={busy || !project.source?.blocks.length || configured === false}>
      <Sparkles size={15} />Gerar documento<ArrowUpRight size={14} /></button>
    <small className="dg-help">O envio do documento inicia a geração no padrão aprovado. As orientações são opcionais.</small>
    {configured === false && <small className="dg-help">Configure OPENAI_API_KEY no servidor para usar a IA.</small>}
  </section>;
}
