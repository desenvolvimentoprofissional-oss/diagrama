import { useState } from 'react';
import { Sparkles, ArrowUpRight, ShieldCheck, FilePenLine } from 'lucide-react';
import type { DocumentProject } from '../../shared/document';
export function AiPanel({ project, busy, configured, onMode, onGenerate }: {
  project: DocumentProject; busy: boolean; configured?: boolean;
  onMode: (mode: DocumentProject['mode']) => void; onGenerate: (instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  return <section className="dg-ai-panel" aria-label="Diagramação com inteligência artificial">
    <div className="dg-ai-title"><Sparkles size={16} /><strong>Assistente editorial</strong><span>GPT</span></div>
    <div className="dg-mode-control" role="group" aria-label="Modo de diagramação">
      <button type="button" disabled={busy} aria-pressed={project.mode === 'integral'}
        className={project.mode === 'integral' ? 'is-active' : ''} onClick={() => onMode('integral')}>
        <ShieldCheck size={13} />Integral</button>
      <button type="button" disabled={busy} aria-pressed={project.mode === 'explanatory'}
        className={project.mode === 'explanatory' ? 'is-active' : ''} onClick={() => onMode('explanatory')}>
        <FilePenLine size={13} />Explicativo</button>
    </div>
    <p>{project.mode === 'integral' ? 'Preserva o texto de origem. A IA organiza a apresentação do conteúdo.' :
      'A IA produz uma versão explicativa, com referências ao documento de origem.'}</p>
    <label className="dg-visually-hidden" htmlFor="dg-ai-instructions">Orientações de diagramação</label>
    <textarea id="dg-ai-instructions" rows={3} maxLength={4000} value={instructions} disabled={busy}
      onChange={event => setInstructions(event.target.value)} placeholder="Como você quer apresentar este documento?" />
    <button type="button" className="dg-button dg-button-ai dg-full" onClick={() => onGenerate(instructions)}
      disabled={busy || !project.source?.blocks.length || configured === false}>
      <Sparkles size={15} />Diagramar com IA<ArrowUpRight size={14} /></button>
    {configured === false && <small className="dg-help">Configure OPENAI_API_KEY no servidor para usar a IA.</small>}
  </section>;
}
