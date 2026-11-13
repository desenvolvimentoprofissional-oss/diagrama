import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import type { DocumentProject, ReviewIssue } from '../../shared/document';
import { exportDocx } from './docx';
import { ApiError } from '../auth';

const execute=promisify(execFile);
let inFlight=0;
export type WordProof={available:boolean;completed:boolean;issues:ReviewIssue[];pages?:number;images?:{page:number;image:string}[];document?:Buffer;tocPages?:Record<string,number>};
async function officeExecutable():Promise<string|undefined> {
  const configured=process.env.LIBREOFFICE_PATH;
  const candidates=configured?[configured]:
    (process.env.PATH||'').split(path.delimiter).flatMap(directory=>['soffice','libreoffice'].map(name=>path.join(directory,name)));
  for(const candidate of candidates) {
    try{await access(candidate,constants.X_OK);if((await stat(candidate)).isFile())return candidate;}
    catch{/* A missing renderer is reported to the caller; never replaced by a simulated proof. */}
  }
}
async function rasterExecutable():Promise<string|undefined> {
  const candidates=process.env.PDFTOPPM_PATH?[process.env.PDFTOPPM_PATH]:
    (process.env.PATH||'').split(path.delimiter).map(directory=>path.join(directory,'pdftoppm'));
  for(const candidate of candidates){try{await access(candidate,constants.X_OK);if((await stat(candidate)).isFile())return candidate;}catch{}}
}
export async function wordRendererStatus():Promise<boolean> {
  const [office,raster]=await Promise.all([officeExecutable(),rasterExecutable()]);return Boolean(office&&raster);
}
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new ApiError(499,'A operação foi cancelada.');}
const canonical=(value:string)=>value.normalize('NFKC').replace(/[\s\u00ad\u200b]/gu,'');
function expectedTexts(project:DocumentProject):{blockId?:string;text:string}[] {
  return [{text:project.title},...(project.subtitle?[{text:project.subtitle}]:[]),...project.blocks.flatMap(block=>
    [block.text,block.caption,...block.rows.flat(),...block.items.flatMap(item=>[item.title,item.text]),
      ...(block.nodes||[]).flatMap(node=>[node.label,node.detail]),...(block.edges||[]).map(edge=>edge.label)]
      .filter(text=>text.trim().length>2).map(text=>({blockId:block.id,text})))];
}
const xml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function fontConfiguration(directory:string) {
  const folders=[path.resolve(process.cwd(),'public/fonts'),path.resolve(process.cwd(),'dist/fonts')];
  const configuration=`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include>${folders.map(folder=>`<dir>${xml(folder)}</dir>`).join('')}<cachedir>${xml(path.join(directory,'font-cache'))}</cachedir></fontconfig>`;
  const filename=path.join(directory,'fonts.conf');await writeFile(filename,configuration);return filename;
}
async function inspectPdf(buffer:Buffer,project:DocumentProject,signal?:AbortSignal):Promise<WordProof> {
  Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true,verbosity:0});
  try {
    const pdf=await task.promise;
    if(pdf.numPages>120)return {available:true,completed:false,pages:pdf.numPages,issues:[{severity:'warning',message:'O Word tem mais de 120 páginas. Sua conferência visual precisa ser concluída por partes.'}]};
    const issues:ReviewIssue[]=[];const texts:string[]=[];const bodyPages:{number:number;text:string}[]=[];
    for(let number=1;number<=pdf.numPages;number++) {
      checkAbort(signal);const page=await pdf.getPage(number);const content=await page.getTextContent();
      const strings=content.items.filter((item):item is import('pdfjs-dist/types/src/display/api').TextItem=>'str'in item);
      const pageText=strings.map(item=>item.str).join(' ');
      const height=page.getViewport({scale:1}).height;
      const body=strings.filter(item=>{const y=height-item.transform[5];return y>=28*72/25.4&&y<=275*72/25.4;});
      const bodyText=body.map(item=>item.str).join(' ');texts.push(bodyText);
      const annotations=await page.getAnnotations();
      const internalLinks=annotations.filter(item=>item.subtype==='Link'&&item.dest).length;
      const isToc=/^\s*Sumário\b/u.test(bodyText)||(internalLinks>0&&body.every(item=>item.height<=11.1));
      if(!isToc&&(!project.cover||number>1))bodyPages.push({number,text:bodyText});
      if(!pageText.trim())issues.push({severity:'error',page:number,message:'A renderização do Word contém uma página sem texto.'});
      const viewport=page.getViewport({scale:1});
      if(strings.some(item=>item.str.trim()&&(item.transform[4]<-1||item.transform[4]+item.width>viewport.width+1||item.transform[5]<-1||item.transform[5]>viewport.height+1)))
        issues.push({severity:'error',page:number,message:'Há texto fora dos limites físicos da página renderizada do Word.'});
      page.cleanup();
    }
    const normalized=canonical(texts.join(' '));
    const missing=expectedTexts(project).filter(item=>!normalized.includes(canonical(item.text)));
    for(const item of missing.slice(0,30))issues.push({severity:'error',blockId:item.blockId,message:'Um trecho editável não foi localizado na renderização real do Word.'});
    const tocPages:Record<string,number>={};
    for(const heading of project.blocks.filter(block=>block.kind==='heading'&&block.level<=3)){
      const candidate=bodyPages.find(page=>canonical(page.text).includes(canonical(heading.text)));
      if(candidate)tocPages[heading.id]=candidate.number;
      else issues.push({severity:'error',blockId:heading.id,message:'Um título não foi localizado fora do sumário na renderização do Word.'});
    }
    return {available:true,completed:true,pages:pdf.numPages,issues,tocPages};
  } finally {await task.destroy();}
}
export async function proofWord(project:DocumentProject,signal?:AbortSignal):Promise<WordProof> {
  checkAbort(signal);
  const [executable,raster]=await Promise.all([officeExecutable(),rasterExecutable()]);
  if(!executable||!raster)return {available:false,completed:false,issues:[{severity:'warning',message:'O servidor precisa de LibreOffice e Poppler para conferir o Word. A revisão visual do PDF não comprova a paginação do DOCX.'}]};
  if(inFlight>=1)return {available:true,completed:false,issues:[{severity:'warning',message:'A conferência do Word está ocupada. Aguarde e execute a verificação novamente.'}]};
  inFlight++;let directory:string|undefined;
  try {
    directory=await mkdtemp(path.join(tmpdir(),'diagrama-word-'));
    const filename=path.join(directory,'documento.docx');
    const fonts=await fontConfiguration(directory);const pdfFilename=path.join(directory,'documento.pdf');
    const render=async(document:Buffer)=>{
      checkAbort(signal);await writeFile(filename,document);await rm(pdfFilename,{force:true});
      await execute(executable,[`-env:UserInstallation=${pathToFileURL(path.join(directory!,'profile')).href}`,
        '--headless','--convert-to','pdf:writer_pdf_Export','--outdir',directory!,filename],
        {timeout:60000,maxBuffer:1024*1024,signal,env:{...process.env,FONTCONFIG_FILE:fonts,LANG:'C.UTF-8'}});
      checkAbort(signal);return inspectPdf(await readFile(pdfFilename),project,signal);
    };
    let document=await exportDocx(project);let inspected=await render(document);
    if(!inspected.completed)return inspected;
    if(project.toc&&Object.keys(inspected.tocPages||{}).length){
      const pages=inspected.tocPages!;document=await exportDocx(project,pages);inspected=await render(document);
      if(!inspected.completed)return inspected;
      if(Object.keys(pages).some(id=>pages[id]!==inspected.tocPages?.[id]))
        inspected.issues.push({severity:'error',message:'A numeração do sumário do Word precisa de atualização após a paginação.'});
    }
    await execute(raster,['-jpeg','-scale-to','1100',pdfFilename,path.join(directory,'word-page')],
      {timeout:60000,maxBuffer:1024*1024,signal});
    const files=(await readdir(directory)).filter(name=>/^word-page-\d+\.jpg$/.test(name))
      .sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
    if(files.length!==inspected.pages)throw new Error('Word rasterization incomplete');
    const images:{page:number;image:string}[]=[];
    for(let index=0;index<files.length;index++){
      checkAbort(signal);const image=await readFile(path.join(directory,files[index]));
      if(image.length>3*1024*1024)throw new Error('Word page image too large');
      images.push({page:index+1,image:`data:image/jpeg;base64,${image.toString('base64')}`});
    }
    return {...inspected,images,document};
  } catch {
    checkAbort(signal);
    return {available:true,completed:false,issues:[{severity:'warning',message:'A conferência real do Word não foi concluída. O documento precisa ser verificado antes da publicação.'}]};
  } finally {inFlight--;if(directory)await rm(directory,{recursive:true,force:true});}
}
