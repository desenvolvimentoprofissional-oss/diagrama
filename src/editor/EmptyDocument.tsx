import { FileUp, Layers3, SlidersHorizontal, ArrowUpRight, FileText } from 'lucide-react';
export function EmptyDocument({ onImport, busy }: { onImport: () => void; busy: boolean }) {
  return <div className="dg-empty-document">
    <div className="dg-empty-art" aria-hidden="true"><div className="dg-art-page dg-art-back" /><div className="dg-art-page">
      <span className="dg-art-line dg-art-title" /><span className="dg-art-line" /><span className="dg-art-line dg-art-short" />
      <div className="dg-art-cards"><i /><i /></div><span className="dg-art-line" /><span className="dg-art-line dg-art-short" />
      <div className="dg-art-callout" /><span className="dg-art-line" /><span className="dg-art-line" />
      <span className="dg-art-footer" /></div><span className="dg-art-badge"><FileText size={20} /></span></div>
    <span className="dg-eyebrow">DO CONTEÚDO AO DOCUMENTO</span>
    <h1>Boas ideias merecem<br />uma boa apresentação.</h1>
    <p>Importe seu conteúdo e gere um documento editável no padrão CRA-SP, com planejamento editorial, infográficos e conferência das páginas.</p>
    <button type="button" className="dg-button dg-button-primary dg-button-large" disabled={busy} onClick={onImport}>
      <FileUp size={18} />Importar documento<ArrowUpRight size={16} /></button>
    <small>Word (.docx) ou PDF · até 20 MB</small>
    <div className="dg-empty-steps">
      <div><span><FileUp size={17} /></span><strong>01. Importe</strong><p>O conteúdo é lido e organizado.</p></div>
      <div><span><Layers3 size={17} /></span><strong>02. Gere</strong><p>O padrão institucional já está definido.</p></div>
      <div><span><SlidersHorizontal size={17} /></span><strong>03. Confira e publique</strong><p>Revise os apontamentos e exporte.</p></div>
    </div>
  </div>;
}
