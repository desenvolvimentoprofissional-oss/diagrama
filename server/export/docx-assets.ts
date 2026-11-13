import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType } from 'docx';
import type { DocumentProject } from '../../shared/document';

export const FONT='Libre Franklin';
export const mm=(value:number)=>Math.round(value*56.6929134);
export const hex=(value:string)=>value.replace('#','');
export async function asset(relative:string):Promise<Buffer> {
  const here=path.dirname(fileURLToPath(import.meta.url));
  for(const directory of [here,path.resolve(here,'../../public'),path.resolve(process.cwd(),'public'),path.resolve(process.cwd(),'dist')]) {
    try{return await readFile(path.join(directory,relative));}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  throw new Error('Um recurso do padrão institucional não foi encontrado.');
}
export async function embeddedFonts() {
  const [data,bold]=await Promise.all([asset('fonts/LibreFranklin-Regular.ttf'),asset('fonts/LibreFranklin-Bold.ttf')]);
  return [{name:FONT,data,bold}];
}
export async function logo(project:DocumentProject):Promise<Buffer|undefined> {
  if(project.theme.logo)return Buffer.from(project.theme.logo.split(',')[1],'base64');
  if(project.theme.organization.trim().toUpperCase()==='CRA-SP')return asset('document/logo.png');
}
export async function picture(bytes:Buffer,maxWidth=642,maxHeight=610) {
  const decoded=await loadImage(bytes);
  if(decoded.width*decoded.height>40_000_000)throw new Error('A imagem possui dimensões excessivas.');
  const ratio=Math.min(maxWidth/decoded.width,maxHeight/decoded.height,1);
  const width=Math.max(1,Math.round(decoded.width*ratio));
  const height=Math.max(1,Math.round(decoded.height*ratio));
  const canvas=createCanvas(width,height);canvas.getContext('2d').drawImage(decoded,0,0,width,height);
  return new ImageRun({type:'png',data:canvas.toBuffer('image/png'),transformation:{width,height}});
}
export function referenceCover(project:DocumentProject) {
  return project.theme.organization.trim().toUpperCase()==='CRA-SP'&&!project.theme.logo&&project.theme.primary.toLowerCase()==='#183364'&&project.subtitle.length<=280;
}
export async function coverTextMetrics(project:DocumentProject) {
  GlobalFonts.register(await asset('fonts/LibreFranklin-Bold.ttf'),FONT);
  const context=createCanvas(1,1).getContext('2d');const width=170*96/25.4;
  let size=project.title.length>90?30:38;
  for(;size>=20;size-=2){
    context.font=`bold ${size*96/72}px "${FONT}"`;
    let lines=1,current='';
    for(const word of project.title.split(/\s+/)){const candidate=current?`${current} ${word}`:word;
      if(context.measureText(candidate).width>width&&current){lines++;current=word;}else current=candidate;}
    const height=lines*size*1.12*25.4/72+(project.subtitle?17:0);
    if(height<=68)return {size,top:48+(72-height)/2};
  }
  return {size:20,top:48};
}
export async function background(project:DocumentProject,cover=false) {
  const canvas=createCanvas(794,1123);const context=canvas.getContext('2d');
  if(cover&&referenceCover(project)){
    context.drawImage(await loadImage(await asset('design-reference/cover-art.jpg')),0,0,794,1123);
    return new ImageRun({type:'png',data:canvas.toBuffer('image/png'),transformation:{width:794,height:1123},
      floating:{horizontalPosition:{relative:HorizontalPositionRelativeFrom.PAGE,offset:0},
        verticalPosition:{relative:VerticalPositionRelativeFrom.PAGE,offset:0},behindDocument:true,
        allowOverlap:true,layoutInCell:false,wrap:{type:TextWrappingType.NONE}}});
  }
  context.fillStyle=cover?project.theme.primary:'#ffffff';context.fillRect(0,0,794,1123);
  context.globalAlpha=cover?.13:.14;
  context.drawImage(await loadImage(await asset('document/pattern.png')),0,0,794,1123);context.globalAlpha=1;
  return new ImageRun({type:'png',data:canvas.toBuffer('image/png'),transformation:{width:794,height:1123},
    floating:{horizontalPosition:{relative:HorizontalPositionRelativeFrom.PAGE,offset:0},
      verticalPosition:{relative:VerticalPositionRelativeFrom.PAGE,offset:0},behindDocument:true,
      allowOverlap:true,layoutInCell:false,wrap:{type:TextWrappingType.NONE}}});
}
export async function footerPoint(project:DocumentProject) {
  const canvas=createCanvas(24,36);const context=canvas.getContext('2d');
  context.fillStyle=project.theme.primary;context.beginPath();context.moveTo(0,0);context.lineTo(24,18);context.lineTo(0,36);context.closePath();context.fill();
  return new ImageRun({type:'png',data:canvas.toBuffer('image/png'),transformation:{width:13,height:20}});
}

export async function coverLogo(project:DocumentProject) {
  const bytes=await logo(project);if(!bytes)return;
  if(project.theme.logo)return picture(bytes,145,105);
  const decoded=await loadImage(bytes);const canvas=createCanvas(decoded.width,decoded.height);
  const context=canvas.getContext('2d');context.drawImage(decoded,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  for(let index=0;index<pixels.data.length;index+=4){pixels.data[index]=255;pixels.data[index+1]=255;pixels.data[index+2]=255;}
  context.putImageData(pixels,0,0);return picture(canvas.toBuffer('image/png'),145,105);
}
