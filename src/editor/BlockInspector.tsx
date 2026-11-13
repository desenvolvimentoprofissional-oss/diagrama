import { ArrowUp, ArrowDown, Copy, Trash2, Plus, X, FileCheck2 } from 'lucide-react';
import { blockKinds, type DocumentBlock, type DocumentProject } from '../../shared/document';
import { blockLabels } from './labels';
import { ImageUpload } from './ImageUpload';
import { TableEditor } from './TableEditor';
import { DiagramEditor } from './DiagramEditor';
export function BlockInspector({ block, project, onChange, onMove, onDuplicate, onRemove, disabled }: {
  block: DocumentBlock; project: DocumentProject; onChange: (patch: Partial<DocumentBlock>) => void;
  onMove: (delta: number) => void; onDuplicate: () => void; onRemove: () => void; disabled: boolean;
}) {
  const position = project.blocks.findIndex(item => item.id === block.id);
  const originals = project.source?.blocks.filter(item => block.sourceIds.includes(item.id)) || [];
  function changeKind(kind: DocumentBlock['kind']) {
    const patch: Partial<DocumentBlock> = { kind };
    if (block.kind === 'diagram' && kind !== 'diagram') { patch.nodes=[]; patch.edges=[]; patch.layout='auto'; }
    const content = block.text || block.nodes?.map(node => [node.label,node.detail].filter(Boolean).join('\n')).join('\n\n') || block.items.map(item => [item.title, item.text].filter(Boolean).join('\n')).join('\n\n')
      || block.rows.map(row => row.join(' | ')).join('\n') || block.caption;
    if (['heading', 'paragraph', 'list', 'callout'].includes(kind)) patch.text = content;
    if (kind === 'image' && !block.caption) patch.caption = content;
    if ((kind === 'cards' || kind === 'steps') && !block.items.length) {
      patch.items = [{ title: '', text: content }]; patch.text = '';
    }
    if (kind === 'diagram' && !block.nodes?.length) {
      patch.nodes = [{id:crypto.randomUUID(),label:'',detail:content.slice(0,700),sourceIds:[...block.sourceIds]}];
      patch.edges=[]; patch.layout='process'; patch.text=content.length>700?content:'';
    }
    if (kind === 'table' && !block.rows.length) { patch.rows = [[content, '']]; patch.text = ''; }
    onChange(patch);
  }
  return <fieldset className="dg-fields" disabled={disabled}>
    <div className="dg-section-heading"><span>Componente {position + 1}</span>
      <div className="dg-inline-actions">
        <button type="button" className="dg-icon-button" aria-label="Mover para cima" title="Mover para cima"
          disabled={position === 0} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
        <button type="button" className="dg-icon-button" aria-label="Mover para baixo" title="Mover para baixo"
          disabled={position === project.blocks.length - 1} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
        <button type="button" className="dg-icon-button" aria-label="Duplicar componente" title="Duplicar"
          onClick={onDuplicate}><Copy size={15} /></button>
        <button type="button" className="dg-icon-button dg-danger" aria-label="Excluir componente" title="Excluir"
          onClick={onRemove}><Trash2 size={15} /></button>
      </div></div>
    <label>Tipo de componente<select aria-label="Tipo de componente" value={block.kind}
      onChange={event => changeKind(event.target.value as DocumentBlock['kind'])}>
      {blockKinds.map(kind => <option key={kind} value={kind}>{blockLabels[kind]}</option>)}
    </select></label>
    {block.kind === 'heading' && <label>Nível do título<select value={block.level}
      onChange={event => onChange({ level: Number(event.target.value) })}>
      {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>Nível {level}</option>)}</select></label>}
    {block.kind !== 'image' && <label>{['cards', 'steps', 'table', 'diagram'].includes(block.kind) ? 'Título do componente (opcional)' : 'Texto'}
      <textarea rows={block.kind === 'paragraph' || block.kind === 'callout' ? 12 : 4}
        value={block.text} onChange={event => onChange({ text: event.target.value })} />
    </label>}
    {block.kind === 'image' && <>
      <ImageUpload label="Imagem do documento" value={block.image} onChange={image => onChange({ image })} disabled={disabled} />
      <label>Legenda e descrição<textarea rows={3} value={block.caption}
        onChange={event => onChange({ caption: event.target.value })} /></label>
    </>}
    {block.kind === 'table' && <TableEditor rows={block.rows} onChange={rows => onChange({ rows })} />}
    {block.kind === 'diagram' && <DiagramEditor block={block} project={project} onChange={onChange} />}
    {(block.kind === 'cards' || block.kind === 'steps') && <div className="dg-item-editor">
      {block.items.map((item, index) => <div className="dg-item-card" key={index}>
        <div className="dg-item-title"><span>{block.kind === 'steps' ? 'Etapa' : 'Card'} {index + 1}</span>
          <button type="button" className="dg-icon-button" aria-label={`Remover item ${index + 1}`}
            onClick={() => onChange({ items: block.items.filter((_, key) => key !== index) })}><X size={14} /></button></div>
        <label>Título<input value={item.title} onChange={event => onChange({ items: block.items.map((value, key) =>
          key === index ? { ...value, title: event.target.value } : value) })} /></label>
        <label>Conteúdo<textarea rows={4} value={item.text} onChange={event => onChange({ items: block.items.map((value, key) =>
          key === index ? { ...value, text: event.target.value } : value) })} /></label>
      </div>)}
      <button type="button" className="dg-button dg-button-secondary dg-full" disabled={block.items.length >= 100}
        onClick={() => onChange({ items: [...block.items, { title: '', text: '' }] })}><Plus size={15} />
        {block.kind === 'steps' ? 'Adicionar etapa' : 'Adicionar card'}</button>
    </div>}
    {(block.kind === 'cards' || block.kind === 'steps') && <label>Organização visual<select aria-label="Organização visual" value={block.layout || 'auto'}
      onChange={event => onChange({layout:event.target.value as DocumentBlock['layout']})}>
      <option value="auto">Automática</option><option value="grid">Em colunas</option>
      <option value="process">Em sequência</option><option value="comparison">Comparação</option></select></label>}
    <label className="dg-switch"><span>Iniciar em nova página</span><input type="checkbox" checked={block.breakBefore}
      onChange={event => onChange({ breakBefore: event.target.checked })} /><span className="dg-switch-track" /></label>
    {originals.length > 0 && <details className="dg-source-details"><summary><FileCheck2 size={14} />Consultar texto de origem</summary>
      {originals.map(original => <div className="dg-original" key={original.id}>
        <small>{original.sourcePage ? `Página ${original.sourcePage}` : 'Documento de origem'}</small>
        <p>{original.text || original.rows.map(row => row.join(' | ')).join('\n') || original.caption || 'Imagem de origem'}</p>
      </div>)}
    </details>}
    {project.mode === 'integral' && block.sourceIds.length > 0 && <small className="dg-help">
      No modo integral, alterações no texto são apontadas na verificação de integridade.</small>}
  </fieldset>;
}
