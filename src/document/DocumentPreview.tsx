import { useEffect, useRef } from 'react';
import type { DocumentProject, ReviewIssue } from '../../shared/document';
import { paginateDocument } from './paginate';
import { documentCss } from './styles';

export type DocumentPreviewProps = {
  project:DocumentProject;
  selectedId?:string;
  onSelect?:(id:string)=>void;
  onLayout?:(result:{pageCount:number;issues:ReviewIssue[]})=>void;
};

export async function preloadDocumentImages(project:DocumentProject):Promise<ReviewIssue[]> {
  const values=[{image:project.theme.logo,id:undefined},...project.blocks.filter(b=>b.kind==='image').map(b=>({image:b.image,id:b.id}))];
  const issues:ReviewIssue[]=[];
  await Promise.all(values.filter(value=>Boolean(value.image)).map(value=>new Promise<void>(resolve=>{
    if(!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value.image)){
      issues.push({severity:'error',blockId:value.id,message:'Imagem em formato não suportado. Envie um arquivo PNG, JPEG, WEBP ou GIF.'});resolve();return;
    }
    const image=new Image();image.onload=()=>resolve();image.onerror=()=>{
      issues.push({severity:'error',blockId:value.id,message:'Não foi possível decodificar uma imagem. Substitua o arquivo.'});resolve();
    };image.src=value.image;
  })));
  return issues;
}

export function DocumentPreview({project,selectedId,onSelect,onLayout}:DocumentPreviewProps) {
  const container=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onSelect,onLayout});callbacks.current={onSelect,onLayout};
  const selection=useRef(selectedId);selection.current=selectedId;
  useEffect(()=>{
    let stopped=false;
    const timer=setTimeout(async()=>{
      await Promise.all([document.fonts.load('11pt \"Libre Franklin\"'),document.fonts.load('700 22pt \"Libre Franklin\"')]);
      await document.fonts.ready;
      const imageIssues=await preloadDocumentImages(project);
      if(stopped || !container.current)return;
      const result=paginateDocument(container.current,project);
      result.issues.push(...imageIssues);
      container.current.dataset.interactive='true';
      container.current.querySelectorAll('[data-block-id]').forEach(el=>{
        el.classList.toggle('dg-selected',(el as HTMLElement).dataset.blockId===selection.current);
      });
      callbacks.current.onLayout?.(result);
    },100);
    return()=>{stopped=true;clearTimeout(timer);};
  },[project]);
  useEffect(()=>{
    container.current?.querySelectorAll('[data-block-id]').forEach(el=>{
      el.classList.toggle('dg-selected',(el as HTMLElement).dataset.blockId===selectedId);
    });
  },[selectedId,project]);
  return <><style>{documentCss}</style><div ref={container} className="dg-document"
    onClick={event=>{
      const block=(event.target as HTMLElement).closest<HTMLElement>('[data-block-id]');
      if(block?.dataset.blockId)callbacks.current.onSelect?.(block.dataset.blockId);
    }} aria-label="Pré-visualização paginada do documento" /></>;
}
export default DocumentPreview;
