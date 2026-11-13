import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GitBranch, Plus, X } from 'lucide-react';
import type { DocumentBlock, DocumentProject } from '../../shared/document';
type Node=NonNullable<DocumentBlock['nodes']>[number];
type Edge=NonNullable<DocumentBlock['edges']>[number];
const layouts=[['auto','Automático'],['process','Processo'],['decision','Decisões'],
  ['hierarchy','Responsabilidades e hierarquia'],['timeline','Linha do tempo'],['grid','Visão em blocos']] as const;
export function DiagramEditor({block,project,onChange}: {
  block:DocumentBlock;project:DocumentProject;onChange:(patch:Partial<DocumentBlock>)=>void;
}) {
  const nodes=block.nodes||[];const edges=block.edges||[];
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  useEffect(()=>{setExpanded({});},[block.id]);
  function updateNode(id:string,patch:Partial<Node>) {
    const next=nodes.map(node=>node.id===id?{...node,...patch}:node);
    const sourceIds=[...new Set([...block.sourceIds,...next.flatMap(node=>node.sourceIds)])];
    onChange({nodes:next,sourceIds});
  }
  function removeNode(id:string) { if(nodes.length<=1)return; onChange({nodes:nodes.filter(node=>node.id!==id),
    edges:edges.filter(edge=>edge.from!==id&&edge.to!==id)}); }
  function moveNode(index:number,delta:number) {
    const next=[...nodes];[next[index],next[index+delta]]=[next[index+delta],next[index]];onChange({nodes:next});
  }
  function updateEdge(index:number,patch:Partial<Edge>) {
    onChange({edges:edges.map((edge,key)=>key===index?{...edge,...patch}:edge)});
  }
  function addConnection() {
    const available=nodes.flatMap(from=>nodes.map(to=>({from:from.id,to:to.id,label:''})))
      .find(edge=>edge.from!==edge.to&&!edges.some(existing=>existing.from===edge.from&&existing.to===edge.to));
    if(available)onChange({edges:[...edges,available]});
  }
  const invalidConnections=edges.some((edge,index)=>edge.from===edge.to||!nodes.some(node=>node.id===edge.from)
    ||!nodes.some(node=>node.id===edge.to)||edges.some((other,key)=>key<index&&other.from===edge.from&&other.to===edge.to));
  return <div className="dg-diagram-editor">
    <label>Organização visual<select aria-label="Organização visual" value={block.layout||'auto'}
      onChange={event=>onChange({layout:event.target.value as DocumentBlock['layout']})}>
      {layouts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <p className="dg-help">Os elementos e as conexões permanecem editáveis. A organização das páginas é automática.</p>
    <div className="dg-section-heading"><span>Elementos · {nodes.length}</span><GitBranch size={14}/></div>
    <div className="dg-inspector-nodes">{nodes.map((node,index)=><section key={node.id} className="dg-inspector-node">
      <button type="button" className="dg-inspector-node-toggle" aria-expanded={expanded[node.id]??index===0}
        aria-label={`Editar elemento ${index+1}: ${node.label||'Sem título'}`}
        onClick={()=>setExpanded(previous=>({...previous,[node.id]:!(previous[node.id]??index===0)}))}>
        <span>{index+1}</span><strong>{node.label||'Elemento sem título'}</strong></button>
      {(expanded[node.id]??index===0)&&<div className="dg-inspector-node-body">
        <div className="dg-inline-actions dg-node-actions">
          <button type="button" className="dg-icon-button" aria-label={`Mover elemento ${index+1} para cima`}
            disabled={index===0} onClick={()=>moveNode(index,-1)}><ArrowUp size={13}/></button>
          <button type="button" className="dg-icon-button" aria-label={`Mover elemento ${index+1} para baixo`}
            disabled={index===nodes.length-1} onClick={()=>moveNode(index,1)}><ArrowDown size={13}/></button>
          <button type="button" className="dg-text-button dg-danger" aria-label={`Remover elemento ${index+1}`}
            disabled={nodes.length<=1} onClick={()=>removeNode(node.id)}><X size={13}/>Remover</button>
        </div>
        <label>Título do elemento<input aria-label={`Título do elemento ${index+1}`} maxLength={160} value={node.label}
          onChange={event=>updateNode(node.id,{label:event.target.value})}/></label>
        <label>Descrição<textarea aria-label={`Descrição do elemento ${index+1}`} rows={4} maxLength={700} value={node.detail}
          onChange={event=>updateNode(node.id,{detail:event.target.value})}/></label>
        {!!project.source?.blocks.length&&<details className="dg-source-details"><summary>Vínculo com a origem</summary>
          <label>Trechos que fundamentam o elemento<select multiple size={4} value={node.sourceIds}
            onChange={event=>updateNode(node.id,{sourceIds:[...event.target.selectedOptions].map(option=>option.value)})}>
            {project.source.blocks.map(source=><option key={source.id} value={source.id}>
              {(source.text||source.rows[0]?.join(' · ')||source.caption||'Imagem').slice(0,120)}</option>)}
          </select></label><small className="dg-help">Selecione os trechos relacionados. Use Ctrl ou ⌘ para selecionar mais de um.</small>
        </details>}
      </div>}
    </section>)}</div>
    <button type="button" className="dg-button dg-button-secondary dg-full" disabled={nodes.length>=18}
      onClick={()=>onChange({nodes:[...nodes,{id:crypto.randomUUID(),label:'',detail:'',sourceIds:[]} ]})}>
      <Plus size={14}/>Adicionar elemento</button>
    <div className="dg-section-heading"><span>Conexões · {edges.length}</span></div>
    {invalidConnections&&<p role="alert" className="dg-inline-warning">Revise as conexões: origem e destino devem ser diferentes e cada ligação deve aparecer uma vez.</p>}
    <div className="dg-inspector-edges">{edges.map((edge,index)=><div className="dg-inspector-edge" key={index}>
      <div className="dg-item-title"><span>Conexão {index+1}</span><button type="button" className="dg-icon-button"
        aria-label={`Remover conexão ${index+1}`} onClick={()=>onChange({edges:edges.filter((_,key)=>key!==index)})}><X size={13}/></button></div>
      <label>De<select aria-label={`Origem da conexão ${index+1}`} value={edge.from} onChange={event=>updateEdge(index,{from:event.target.value})}>
        {nodes.map((node,key)=><option key={node.id} value={node.id}>{key+1}. {node.label||'Elemento sem título'}</option>)}</select></label>
      <label>Para<select aria-label={`Destino da conexão ${index+1}`} value={edge.to} onChange={event=>updateEdge(index,{to:event.target.value})}>
        {nodes.map((node,key)=><option key={node.id} value={node.id} disabled={node.id===edge.from}>{key+1}. {node.label||'Elemento sem título'}</option>)}</select></label>
      <label>Texto da conexão<input maxLength={100} value={edge.label} placeholder="Condição ou relação (opcional)"
        onChange={event=>updateEdge(index,{label:event.target.value})}/></label>
    </div>)}</div>
    <button type="button" className="dg-button dg-button-secondary dg-full" disabled={nodes.length<2||edges.length>=40
      ||edges.length>=nodes.length*(nodes.length-1)} onClick={addConnection}><Plus size={14}/>Adicionar conexão</button>
  </div>;
}
