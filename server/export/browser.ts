import fs from 'node:fs';
import chromium from '@sparticuz/chromium';
import puppeteer, {type Browser} from 'puppeteer-core';
import type {DocumentProject} from '../../shared/document';
import {renderDocumentHtml} from './html';

let occupied=0;
async function launch():Promise<Browser> {
  const configured=process.env.CHROMIUM_PATH;
  const system=[configured,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(value=>value&&fs.existsSync(value));
  return puppeteer.launch({
    executablePath:system || await chromium.executablePath(),
    args:system?['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']:chromium.args,
    headless:true,
  });
}

export async function withDocumentPage<T>(project:DocumentProject,action:(page:import('puppeteer-core').Page)=>Promise<T>):Promise<T> {
  if(occupied>=2)throw new Error('Há duas exportações em andamento. Aguarde sua conclusão e tente novamente.');
  occupied++;let browser:Browser|undefined;
  try {
    browser=await launch();
    const page=await browser.newPage();
    await page.setViewport({width:794,height:1123,deviceScaleFactor:1});
    await page.setRequestInterception(true);
    page.on('request',request=>{if(/^(data:|about:)/.test(request.url()))void request.continue();else void request.abort();});
    await page.setContent(await renderDocumentHtml(project),{waitUntil:'load',timeout:120000});
    await page.waitForFunction('window.__layoutReady === true',{timeout:120000});
    const state=await page.evaluate(()=>({error:(window as any).__layoutError,result:(window as any).__layoutResult}));
    if(state.error)throw new Error(String(state.error).startsWith('Uma imagem não pôde')?state.error:'Não foi possível paginar o documento.');
    const errors=state.result?.issues?.filter((issue:any)=>issue.severity==='error');
    if(errors?.length)throw new Error(`O documento tem ${errors.length} página(s) com conteúdo fora da área útil. Revise a composição antes de exportar.`);
    return await action(page);
  } finally {try{await browser?.close();}finally{occupied--;}}
}

export async function exportPdf(project:DocumentProject):Promise<Buffer> {
  return withDocumentPage(project,async page=>Buffer.from(await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:0,left:0,right:0,bottom:0},tagged:true,outline:true,timeout:120000})));
}

/** Render every page (up to 60) for an explicit AI visual review. */
export async function exportPageImages(project:DocumentProject):Promise<{page:number;image:string}[]> {
  return withDocumentPage(project,async page=>{
    const pages=await page.$$('.document-page');
    if(pages.length>60)throw new Error('A revisão visual por IA admite até 60 páginas por execução. Divida o documento para revisar todas as páginas.');
    const indexes=pages.map((_,index)=>index);
    const result:{page:number;image:string}[]=[];
    for(const index of indexes){
      const buffer=await pages[index].screenshot({type:'jpeg',quality:70});
      result.push({page:index+1,image:`data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`});
    }
    return result;
  });
}
