import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AIError} from './client';
const names=['chapter','access-map','decision','process'] as const;
let cached:Promise<Record<string,unknown>[]>|undefined;
async function load():Promise<Record<string,unknown>[]> {
  const here=path.dirname(fileURLToPath(import.meta.url));
  const images:Record<string,unknown>[]=[];
  for(const name of names){
    const relative=`design-reference/${name}.jpg`;
    const candidates=[path.resolve(here,relative),path.resolve(here,'../../public',relative),
      path.resolve(process.cwd(),'public',relative),path.resolve(process.cwd(),'dist',relative)];
    let bytes:Buffer|undefined;
    for(const file of candidates){try{bytes=await fs.readFile(file);break;}catch(error){
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    }}
    if(!bytes?.length || bytes.length>2*1024*1024)
      throw new AIError('A referência visual institucional não está disponível nesta publicação. Republique o Diagrama completo.',503,'design_reference');
    images.push({type:'input_text',text:`Referência visual ${name}: observar composição, nunca copiar fatos ou regras.`},
      {type:'input_image',image_url:`data:image/jpeg;base64,${bytes.toString('base64')}`,detail:'high'});
  }
  return images;
}
export function referenceImages():Promise<Record<string,unknown>[]> {
  cached??=load().catch(error=>{cached=undefined;throw error;});
  return cached;
}
