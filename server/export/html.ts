import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {DocumentProject} from '../../shared/document';
import {documentCss} from '../../src/document/styles';
import {paginateDocument} from '../../src/document/paginate';

async function asset(relative:string):Promise<Buffer> {
  const here=path.dirname(fileURLToPath(import.meta.url));
  const candidates=[path.join(here,relative),path.resolve(here,'../../public',relative),
    path.resolve(process.cwd(),'public',relative),path.resolve(process.cwd(),'dist',relative)];
  for(const candidate of candidates){try{return await fs.readFile(candidate);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  throw new Error(`Recurso de diagramação não encontrado: ${relative}`);
}

export async function renderDocumentHtml(project:DocumentProject):Promise<string> {
  let css=documentCss;
  for(const file of ['LibreFranklin-Regular.ttf','LibreFranklin-Bold.ttf']){
    const encoded=(await asset(`fonts/${file}`)).toString('base64');
    css=css.replaceAll(`/fonts/${file}`,`data:font/ttf;base64,${encoded}`);
  }
  css=css.replaceAll('/document/pattern.png',`data:image/png;base64,${(await asset('document/pattern.png')).toString('base64')}`);
  const serialized=JSON.stringify(project).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const paginate=paginateDocument.toString();
  const defaultLogo=`data:image/png;base64,${(await asset('document/logo.png')).toString('base64')}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:0;background:#fff}</style></head><body><main id="document" class="dg-document"></main><script type="application/json" id="project">${serialized}</script><script>
  var __name=function(value){return value;};\n  window.__layoutReady=false;
  (async function(){
    try {
      const project=JSON.parse(document.getElementById('project').textContent);
      const defaultLogo=${JSON.stringify(defaultLogo)};
      await Promise.all([document.fonts.load('11pt \"Libre Franklin\"'),document.fonts.load('700 22pt \"Libre Franklin\"')]);
      await document.fonts.ready;
      const images=[project.theme.logo || (project.theme.organization.trim().toUpperCase()==='CRA-SP'?defaultLogo:''),...project.blocks.filter(b=>b.kind==='image').map(b=>b.image)];
      await Promise.all(images.filter(v=>/^data:image\\/(?:png|jpe?g|webp|gif);base64,/i.test(v)).map(v=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('Uma imagem não pôde ser decodificada. Substitua o arquivo e tente novamente.'));image.src=v;})));
      window.__layoutResult=(${paginate})(document.getElementById('document'),project,defaultLogo);
    }catch(error){window.__layoutError=String(error.message||error);}
    window.__layoutReady=true;
  })();</script></body></html>`;
}
