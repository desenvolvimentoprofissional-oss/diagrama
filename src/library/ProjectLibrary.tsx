import { useEffect, useRef } from 'react';
import { FileText, X, ArrowUpRight, FolderOpen } from 'lucide-react';
import type { SavedMetadata } from '../services/storage';
type Props={records:SavedMetadata[];loading:boolean;hasMore:boolean;error:string;onClose:()=>void;onOpen:(id:string)=>void;onMore:()=>void};
export function ProjectLibrary(props:Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="project-library" onCancel={props.onClose}>
    <div className="library-top"><div><span className="eyebrow">IDP-WORK</span><h2>Meus documentos</h2></div>
      <button type="button" aria-label="Fechar biblioteca" onClick={props.onClose}><X size={20}/></button></div>
    <p className="library-description">Documentos salvos pelo Work, disponíveis para continuar a edição.</p>
    {props.error&&<p role="alert" className="library-error">{props.error}</p>}
    {!props.loading&&!props.records.length&&!props.error&&<div className="library-empty"><FolderOpen size={40}/><p>Seu primeiro documento começa aqui.</p></div>}
    <div className="library-list">{props.records.map(record=><button type="button" className="library-record" key={record.id} onClick={()=>props.onOpen(record.id)}>
      <span className="record-icon"><FileText size={24}/></span><span><strong>{record.title}</strong>
        <small>{new Date(record.updatedAt).toLocaleString('pt-BR')} · versão {record.revision}</small></span><ArrowUpRight size={18}/>
    </button>)}</div>
    {props.loading&&<p role="status">Carregando documentos do Work…</p>}
    {props.hasMore&&<button type="button" onClick={props.onMore} disabled={props.loading}>Carregar mais documentos</button>}
  </dialog>;
}
