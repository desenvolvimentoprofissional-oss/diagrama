import { useState } from 'react';
import { Search, Plus, ChevronDown, FileText, Image, Check } from 'lucide-react';
import { blockKinds, type DocumentBlock, type DocumentProject } from '../../shared/document';
import { blockIcons, blockLabels, blockSummary } from './labels';
export function Outline({ project, selectedId, onSelect, onAdd, disabled }: {
  project: DocumentProject; selectedId?: string; onSelect: (id: string) => void;
  onAdd: (kind: DocumentBlock['kind']) => void; disabled: boolean;
}) {
  const [tab, setTab] = useState<'structure' | 'source'>('structure');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(150);
  const blocks = tab === 'structure' ? project.blocks : project.source?.blocks || [];
  const filtered = blocks.filter(block => blockSummary(block).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  return <section className="dg-outline">
    <div className="dg-sidebar-tabs" role="tablist" aria-label="Conteúdo do documento">
      <button role="tab" aria-selected={tab === 'structure'} className={tab === 'structure' ? 'is-active' : ''}
        onClick={() => { setTab('structure'); setShown(150); }}>Estrutura <span>{project.blocks.length}</span></button>
      <button role="tab" aria-selected={tab === 'source'} className={tab === 'source' ? 'is-active' : ''}
        onClick={() => { setTab('source'); setShown(150); }}>Origem</button>
    </div>
    {tab === 'source' && project.source && <div className="dg-source-meta"><FileText size={16} />
      <div><strong title={project.source.name}>{project.source.name}</strong><small>
        {project.source.format.toUpperCase()} · {project.source.blocks.length} componentes{project.source.ocr ? ' · OCR' : ''}</small></div></div>}
    <div className="dg-outline-search"><Search size={14} /><input aria-label="Localizar conteúdo"
      placeholder="Localizar no documento" value={query} onChange={event => { setQuery(event.target.value); setShown(150); }} /></div>
    {tab === 'structure' && <details className="dg-add-menu"><summary><Plus size={15} />Adicionar componente<ChevronDown size={13} /></summary>
      <div>{blockKinds.map(kind => { const Icon = blockIcons[kind]; return <button type="button" key={kind}
        disabled={disabled || project.blocks.length >= 6000} onClick={event => { onAdd(kind); (event.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>
        <Icon size={14} />{blockLabels[kind]}</button>; })}</div></details>}
    <div className="dg-outline-list" role="list" aria-label={tab === 'structure' ? 'Componentes' : 'Conteúdo de origem'}>
      {filtered.slice(0, shown).map((block, index) => {
        const Icon = blockIcons[block.kind];
        const matching = tab === 'source' ? project.blocks.find(item => item.sourceIds.includes(block.id)) : block;
        return <button type="button" role="listitem" key={block.id} disabled={!matching}
          className={`dg-outline-item ${selectedId === matching?.id ? 'is-selected' : ''} ${block.kind === 'heading' ? 'is-heading' : ''}`}
          onClick={() => matching && onSelect(matching.id)} aria-current={selectedId === matching?.id ? 'true' : undefined}>
          <span className="dg-outline-number">{index + 1}</span><Icon size={14} /><span title={blockSummary(block)}>{blockSummary(block)}</span>
          {tab === 'source' && matching && <Check size={12} className="dg-source-check" />}
        </button>;
      })}
      {!filtered.length && <p className="dg-empty-outline">{query ? 'Nenhum resultado.' : tab === 'source' ?
        'O documento importado aparece aqui para consulta.' : 'Importe um documento ou adicione o primeiro componente.'}</p>}
      {filtered.length > shown && <button className="dg-text-button dg-full" onClick={() => setShown(shown + 150)}>
        Mostrar mais ({filtered.length - shown})</button>}
    </div>
    {tab === 'source' && project.source?.warnings.length ? <details className="dg-import-warnings">
      <summary>{project.source.warnings.length} observação(ões) da importação</summary>
      {project.source.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
    </details> : null}
  </section>;
}
