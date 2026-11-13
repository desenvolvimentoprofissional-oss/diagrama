import fs from 'node:fs';
import chromium from '@sparticuz/chromium';
import puppeteer, {type Browser,type Page} from 'puppeteer-core';
import type {DocumentProject,ReviewIssue} from '../../shared/document';
import type {DocumentComposition} from '../../src/document/composition';
import {ApiError} from '../auth';
import {renderDocumentHtml} from './html';

let occupied=0;
async function launch():Promise<Browser> {
  const configured=process.env.CHROMIUM_PATH;
  const system=[configured,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(value=>value&&fs.existsSync(value));
  return puppeteer.launch({executablePath:system||await chromium.executablePath(),
    args:system?['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']:chromium.args,headless:true});
}
export async function withDocumentPage<T>(project:DocumentProject,action:(page:Page)=>Promise<T>,strict=true):Promise<T> {
  if(occupied>=2)throw new ApiError(429,'Há duas composições em andamento. Aguarde e tente novamente.');
  occupied++;let browser:Browser|undefined;
  try {
    browser=await launch();const page=await browser.newPage();
    await page.setViewport({width:794,height:1123,deviceScaleFactor:1});
    await page.setRequestInterception(true);
    page.on('request',request=>{if(/^(data:|about:)/.test(request.url()))void request.continue();else void request.abort();});
    await page.setContent(await renderDocumentHtml(project),{waitUntil:'load',timeout:120000});
    await page.waitForFunction('window.__layoutReady === true',{timeout:120000});
    const state=await page.evaluate(()=>({error:(window as any).__layoutError,result:(window as any).__layoutResult}));
    if(state.error)throw new ApiError(422,String(state.error).startsWith('Uma imagem não pôde')?state.error:'Não foi possível compor o documento.');
    const errors=state.result?.issues?.filter((issue:ReviewIssue)=>issue.severity==='error');
    if(strict&&errors?.length)throw new ApiError(422,
      `A composição contém ${errors.length} problema(s) de leitura ou posicionamento. Execute a revisão antes de exportar.`);
    return await action(page);
  } finally {try{await browser?.close();}finally{occupied--;}}
}
export async function exportPdf(project:DocumentProject):Promise<Buffer> {
  return withDocumentPage(project,async page=>Buffer.from(await page.pdf({format:'A4',printBackground:true,
    preferCSSPageSize:true,margin:{top:0,left:0,right:0,bottom:0},tagged:true,outline:true,timeout:120000})));
}
async function imagesOf(page:Page):Promise<{page:number;image:string}[]> {
  const pages=await page.$$('.document-page');
  if(pages.length>120)throw new ApiError(422,'A conferência visual automática admite até 120 páginas. Divida o documento para conferir todas elas.');
  const result:{page:number;image:string}[]=[];
  for(let index=0;index<pages.length;index++){
    const buffer=await pages[index].screenshot({type:'jpeg',quality:76});
    result.push({page:index+1,image:`data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`});
  }
  return result;
}
export async function exportPageImages(project:DocumentProject):Promise<{page:number;image:string}[]> {
  return withDocumentPage(project,imagesOf);
}
/** The pipeline examines all pages, including defective pages, before attempting a repair. */
export async function inspectDocument(project:DocumentProject):Promise<{pages:number;issues:ReviewIssue[];images:{page:number;image:string}[]}> {
  return withDocumentPage(project,async page=>{
    const layout=await page.evaluate(()=>(window as any).__layoutResult as {pageCount:number;issues:ReviewIssue[]});
    const images=await imagesOf(page);
    return {pages:layout.pageCount,issues:layout.issues,images};
  },false);
}

/** Extract the very same physical fragments used by PDF. Coordinates are absolute A4 millimetres. */
export async function readDocumentComposition(project:DocumentProject):Promise<DocumentComposition> {
  return withDocumentPage(project,page=>page.evaluate((models)=>{
    const seen=new Set<string>();const mm=210/(document.querySelector<HTMLElement>('.document-page')!.getBoundingClientRect().width);
    const source=new Map(models.map(block=>[block.id,block]));
    const pages=[...document.querySelectorAll<HTMLElement>('.document-page')].map((page,index)=>{
      const bounds=page.getBoundingClientRect();
      const kind=page.classList.contains('dg-cover')?'cover':page.querySelector('.dg-toc-title')?'toc':'content';
      const fragments=[...page.querySelector<HTMLElement>('.dg-body')?.children||[]].filter(child=>(child as HTMLElement).dataset.blockId).map(child=>{
        const element=child as HTMLElement;const blockId=element.dataset.blockId!;const model=source.get(blockId)!;
        const rect=element.getBoundingClientRect();const rawKind=element.dataset.fragmentKind||model.kind;
        const kind=rawKind==='caption'?'paragraph':rawKind;
        const figure=element.classList.contains('dg-figure');
        const diagram=kind==='diagram';const card=kind==='cards'||kind==='steps';const table=kind==='table';
        const fragment={blockId,kind,text:figure||diagram||card||table?'':element.textContent||'',caption:'',
          image:figure?element.querySelector('img')?.src||'':'',
          rows:table?[...(element as HTMLTableElement).rows].map(row=>[...row.cells].map(cell=>cell.textContent||'')):[],
          items:card?[...element.querySelectorAll('.dg-card,.dg-step')].filter(item=>!item.parentElement?.closest('.dg-card,.dg-step')).map(item=>({title:item.querySelector('.dg-card-title')?.textContent||'',text:item.querySelector('.dg-card-text')?.textContent||''})):[],
          nodes:diagram?model.nodes||[]:[],edges:diagram?model.edges||[]:[],level:Number(element.dataset.level||model.level),
          continued:seen.has(blockId),top:(rect.top-bounds.top)*mm,height:rect.height*mm,
          layout:model.layout,role:rawKind==='caption'?'caption':element.dataset.role==='component-title'?'component-title':undefined};
        if(card&&!fragment.items.length)fragment.items=[{title:element.querySelector('.dg-card-title')?.textContent||'',text:element.querySelector('.dg-card-text')?.textContent||''}];
        seen.add(blockId);return fragment;
      });
      const tocEntries=[...page.querySelectorAll<HTMLAnchorElement>('.dg-toc-row')].map(anchor=>{
        const id=anchor.hash.replace('#dg-block-','');const model=source.get(id)!;
        return {blockId:id,text:model.text,level:model.level,page:Number(anchor.lastElementChild?.textContent)};
      });
      return {number:index+1,kind,fragments,...(kind==='toc'?{tocEntries}: {})};
    });
    const toc=[...document.querySelectorAll<HTMLAnchorElement>('.dg-toc-row')].map(anchor=>{
      const id=anchor.hash.replace('#dg-block-','');const model=source.get(id)!;
      return {blockId:id,text:model.text,level:model.level,page:Number(anchor.lastElementChild?.textContent)};
    });
    return {pages,toc,issues:(window as any).__layoutResult.issues};
  },project.blocks)) as Promise<DocumentComposition>;
}
export const composePages=readDocumentComposition;
