import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, FileUp, FolderOpen, Plus, Save, Sparkles, PanelLeft, Settings2, X,
  Minus, ZoomIn, ChevronDown, FileCheck2, LoaderCircle, Cloud, Check, AlertCircle, Columns3, Copy, Info } from 'lucide-react';
import { makeBlock, type DocumentBlock, type DocumentProject, type ReviewIssue } from '../../shared/document';
import { DocumentPreview } from '../document/DocumentPreview';
import { IssueList } from '../components/IssueList';
import { Outline } from './Outline';
import { AiPanel } from './AiPanel';
import { DocumentSettings } from './DocumentSettings';
import { BlockInspector } from './BlockInspector';
import { EmptyDocument } from './EmptyDocument';
import type { EditorProps } from './types';
export type { EditorProps } from './types';
export default function Editor(props: EditorProps) {
  const { project, busy } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<'document' | 'block'>('document');
  const [panel, setPanel] = useState<'outline' | 'inspector' | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [pageCount, setPageCount] = useState(0);
  const [layoutIssues, setLayoutIssues] = useState<ReviewIssue[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const handleLayout = useCallback((result: { pageCount: number; issues: ReviewIssue[] }) => {
    setPageCount(result.pageCount);
    setLayoutIssues(previous => JSON.stringify(previous) === JSON.stringify(result.issues) ? previous : result.issues);
  }, []);
  const selected = project.blocks.find(block => block.id === selectedId);
  const hasContent = project.blocks.length > 0;
  const issues = [...props.issues, ...layoutIssues];
  const errors = issues.filter(issue => issue.severity === 'error').length;
  useEffect(() => { setSelectedId(undefined); setInspectorTab('document'); }, [project.id]);
  useEffect(() => { if (selectedId && !selected) setSelectedId(undefined); }, [selectedId, selected]);
  useEffect(() => {
    const closePanel = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', closePanel);
    return () => window.removeEventListener('keydown', closePanel);
  }, []);
  useEffect(() => {
    if (!hasContent) return;
    const fit = () => {
      const canvas = document.querySelector('.dg-canvas');
      if (canvas) setZoom(Math.min(0.9, Math.max(0.35, (canvas.clientWidth - 64) / 794)));
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [hasContent, project.id]);
  function change(patch: Partial<DocumentProject>) {
    props.onChange({ ...project, ...patch, updatedAt: new Date().toISOString() });
  }
  function select(id: string) { setSelectedId(id); setInspectorTab('block'); }
  function selectFromOutline(id: string) {
    select(id);
    const nodes = document.querySelectorAll('[data-block-id]');
    Array.from(nodes).find(node => node.getAttribute('data-block-id') === id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function updateBlock(patch: Partial<DocumentBlock>) {
    change({ blocks: project.blocks.map(block => block.id === selectedId ? { ...block, ...patch } : block) });
  }
  function addBlock(kind: DocumentBlock['kind']) {
    const block = makeBlock(kind);
    if (kind === 'table') block.rows = [['', ''], ['', '']];
    if (kind === 'cards' || kind === 'steps') block.items = [{ title: '', text: '' }, { title: '', text: '' }];
    const index = selected ? project.blocks.indexOf(selected) + 1 : project.blocks.length;
    const blocks = [...project.blocks]; blocks.splice(index, 0, block);
    change({ blocks }); select(block.id); setPanel('inspector');
  }
  function moveBlock(delta: number) {
    const index = project.blocks.findIndex(block => block.id === selectedId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= project.blocks.length) return;
    const blocks = [...project.blocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    change({ blocks });
  }
  function duplicate() {
    if (!selected) return;
    const copy = { ...structuredClone(selected), id: crypto.randomUUID() };
    const blocks = [...project.blocks]; blocks.splice(blocks.indexOf(selected) + 1, 0, copy);
    change({ blocks }); select(copy.id);
  }
  return <div className="dg-app">
    <input ref={fileInput} type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      hidden onChange={event => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.target.value = ''; }} />
    <header className="dg-app-header">
      <a className="dg-brand" href="#" onClick={event => event.preventDefault()} aria-label="Diagrama.ai">
        <span className="dg-brand-symbol"><Columns3 size={20} strokeWidth={2.2} /></span><strong>diagrama<span>.ai</span></strong></a>
      <span className="dg-header-divider" />
      <div className="dg-header-project"><strong title={project.title}>{project.title || 'Documento sem título'}</strong>
        <span><Cloud size={12} />{props.storageStatus}</span></div>
      <div className="dg-header-actions">
        {props.saveCopyEnabled && props.onSaveCopy && <button type="button" className="dg-button dg-button-secondary"
          disabled={busy || !props.canSave || !hasContent || !project.title.trim()} onClick={props.onSaveCopy} aria-label="Salvar cópia">
          <Copy size={15} /><span>Salvar cópia</span></button>}
        <button type="button" className="dg-button dg-button-plain" disabled={busy} onClick={props.onLibrary} aria-label="Meus documentos">
          <FolderOpen size={16} /><span>Meus documentos</span></button>
        <button type="button" className="dg-button dg-button-secondary" disabled={busy} onClick={props.onNew} aria-label="Novo documento">
          <Plus size={16} /><span>Novo</span></button>
        <button type="button" className="dg-button dg-button-primary" disabled={busy || !props.canSave || !hasContent || !project.title.trim()}
          onClick={props.onSave} aria-label="Salvar no Work"><Save size={15} /><span>Salvar no Work</span></button>
      </div>
    </header>
    <div className="dg-workspace-toolbar">
      <div className="dg-inline-actions">
        <button type="button" className={`dg-icon-button dg-mobile-toggle ${panel === 'outline' ? 'is-active' : ''}`}
          aria-label="Abrir estrutura" aria-expanded={panel === 'outline'} onClick={() => setPanel(panel === 'outline' ? null : 'outline')}>
          <PanelLeft size={19} /></button>
        <span className="dg-toolbar-label">ESTÚDIO DE DOCUMENTOS</span>
        <span className="dg-file-badge">A4</span>
        {hasContent && <span className="dg-component-count">{project.blocks.length} componentes</span>}
      </div>
      <div className="dg-toolbar-actions">
        <button type="button" className="dg-button dg-button-plain" disabled={busy} onClick={() => fileInput.current?.click()} aria-label="Importar documento">
          <FileUp size={16} /><span>Importar</span></button>
        <button type="button" className="dg-button dg-button-plain" disabled={busy || !hasContent}
          onClick={() => { setReviewOpen(true); props.onReview(); }} aria-label="Verificar documento"><FileCheck2 size={16} /><span>Verificar</span></button>
        <details className="dg-export-menu"><summary className={`dg-button dg-button-secondary ${busy || !hasContent ? 'is-disabled' : ''}`}
          aria-label="Opções de exportação" onClick={event => { if (busy || !hasContent) event.preventDefault(); }}>
          <ArrowDownToLine size={16} /><span>Exportar</span><ChevronDown size={13} /></summary>
          <div>{(['pdf', 'docx'] as const).map(format => <button type="button" key={format} disabled={busy || !hasContent}
            onClick={event => { (event.currentTarget.closest('details') as HTMLDetailsElement).open = false; props.onExport(format); }}>
            <ArrowDownToLine size={15} /><span>{format === 'pdf' ? 'PDF para publicação' : 'Word editável (.docx)'}</span></button>)}</div>
        </details>
        <button type="button" className={`dg-icon-button dg-mobile-toggle ${panel === 'inspector' ? 'is-active' : ''}`}
          aria-label="Abrir propriedades" aria-expanded={panel === 'inspector'} onClick={() => setPanel(panel === 'inspector' ? null : 'inspector')}>
          <Settings2 size={19} /></button>
      </div>
    </div>
    {(props.error || props.message || busy) && <div className={`dg-feedback ${props.error ? 'is-error' : busy ? 'is-busy' : 'is-info'}`}
      role={props.error ? 'alert' : 'status'} aria-live="polite">
      {props.error ? <AlertCircle size={17} /> : busy ? <LoaderCircle size={17} className="dg-spin" /> : <Info size={17} />}
      <span>{props.error || props.message || 'Processando o documento…'}</span>
      {busy && props.onCancel && <button type="button" className="dg-text-button" onClick={props.onCancel}>Cancelar</button>}
    </div>}
    <main className="dg-workspace">
      {panel && <button className="dg-panel-shade" aria-label="Fechar painel" onClick={() => setPanel(null)} />}
      <aside className={`dg-left-panel ${panel === 'outline' ? 'is-open' : ''}`} aria-label="Estrutura e assistente">
        <div className="dg-mobile-panel-title">Estrutura<button className="dg-icon-button" aria-label="Fechar estrutura"
          onClick={() => setPanel(null)}><X size={17} /></button></div>
        <AiPanel project={project} busy={busy} configured={props.aiConfigured}
          onMode={mode => change({ mode })} onGenerate={props.onGenerate} />
        <Outline project={project} selectedId={selectedId} onSelect={selectFromOutline} onAdd={addBlock} disabled={busy} />
      </aside>
      <section className="dg-canvas" aria-label="Visualização do documento">
        {hasContent ? <>
          <div className="dg-canvas-meta"><span><span className="dg-status-dot" />Visualização paginada</span>
            <small>Clique em um componente para editar</small></div>
          <div className="dg-page-stage" style={{ zoom }}>
            <DocumentPreview project={project} selectedId={selectedId} onSelect={select}
              onLayout={handleLayout} />
          </div>
        </> : <EmptyDocument onImport={() => fileInput.current?.click()} busy={busy} />}
      </section>
      <aside className={`dg-right-panel ${panel === 'inspector' ? 'is-open' : ''}`} aria-label="Propriedades">
        <div className="dg-mobile-panel-title">Propriedades<button className="dg-icon-button" aria-label="Fechar propriedades"
          onClick={() => setPanel(null)}><X size={17} /></button></div>
        <div className="dg-sidebar-tabs" role="tablist" aria-label="Propriedades do documento">
          <button role="tab" aria-selected={inspectorTab === 'document'} className={inspectorTab === 'document' ? 'is-active' : ''}
            onClick={() => setInspectorTab('document')}>Documento</button>
          <button role="tab" aria-selected={inspectorTab === 'block'} className={inspectorTab === 'block' ? 'is-active' : ''}
            onClick={() => setInspectorTab('block')}>Componente</button>
        </div>
        <div className="dg-inspector-content">{inspectorTab === 'document' ? <DocumentSettings project={project}
          onChange={change} disabled={busy} /> : selected ? <BlockInspector block={selected} project={project} disabled={busy}
            onChange={updateBlock} onMove={moveBlock} onDuplicate={duplicate}
            onRemove={() => { change({ blocks: project.blocks.filter(block => block.id !== selected.id) }); setSelectedId(undefined); }} /> :
            <div className="dg-inspector-empty"><Settings2 size={25} /><h3>Selecione um componente</h3>
              <p>Clique na página ou na estrutura para editar o conteúdo e a apresentação.</p></div>}</div>
      </aside>
    </main>
    {reviewOpen && <section className="dg-review-panel" aria-label="Verificação do documento">
      <div className="dg-review-heading"><strong><FileCheck2 size={17} />Verificação do documento</strong>
        <span>{issues.length} apontamento(s)</span><button type="button" className="dg-icon-button" aria-label="Fechar verificação"
          onClick={() => setReviewOpen(false)}><X size={17} /></button></div>
      <IssueList issues={issues} onSelect={selectFromOutline} />
    </section>}
    <footer className="dg-status-bar"><span><span className="dg-status-dot" />{project.mode === 'integral' ? 'Texto integral' : 'Versão explicativa'}
      {hasContent && <> · {pageCount || '…'} página(s)</>}</span>
      <button className={`dg-review-status ${errors ? 'has-errors' : ''}`} type="button" onClick={() => setReviewOpen(!reviewOpen)}>
        <FileCheck2 size={13} />{issues.length ? `${issues.length} apontamento(s)` : 'Verificações'}</button>
      <div className="dg-zoom"><button className="dg-icon-button" aria-label="Reduzir visualização"
        onClick={() => setZoom(value => Math.max(0.35, +(value - 0.1).toFixed(2)))}><Minus size={14} /></button>
        <output>{Math.round(zoom * 100)}%</output><button className="dg-icon-button" aria-label="Ampliar visualização"
          onClick={() => setZoom(value => Math.min(1.5, +(value + 0.1).toFixed(2)))}><ZoomIn size={14} /></button>
        <button className="dg-text-button" onClick={() => {
          const canvas = document.querySelector('.dg-canvas');
          if (canvas) setZoom(Math.min(1, Math.max(0.35, (canvas.clientWidth - 64) / 794)));
        }}>Ajustar</button></div>
    </footer>
  </div>;
}
