import { isPaginationArtifact } from '../../shared/structure';
import type { PdfLine } from './pdf-text';
import type { PlacedImage } from './pdf-images';
export type PdfFrame={page:number;width:number;height:number;lines:PdfLine[];images:PlacedImage[];hasGraphics:boolean};
const key=(line:PdfLine)=>line.text.replace(/\s+/g,' ').trim().toLocaleLowerCase('pt-BR');
const margin=(line:PdfLine,height:number)=>line.y>height*.91||line.y<height*.075;
export function cleanPdfFurniture(frames:PdfFrame[],warnings:string[]):PdfFrame[]{
  const occurrences=new Map<string,Set<number>>(),imagePages=new Map<string,Set<number>>();
  for(const frame of frames){
    for(const line of frame.lines)if(margin(line,frame.height)){
      const pages=occurrences.get(key(line))||new Set<number>();pages.add(frame.page);occurrences.set(key(line),pages);
    }
    for(const image of frame.images){const pages=imagePages.get(image.image)||new Set<number>();pages.add(frame.page);imagePages.set(image.image,pages);}
  }
  const tocPages=new Set(frames.filter(frame=>frame.lines.some(line=>/^sum[áa]rio$/iu.test(line.text.trim()))
    &&frame.lines.filter(line=>/\s\d{1,3}$/u.test(line.text)).length>=3
    &&frame.lines.filter(line=>/^(?:Cap[íi]tulo|Anexo)\s+[IVXLCDM]+\s*[·—–-]/iu.test(line.text)).length>=2).map(frame=>frame.page));
  const threshold=Math.max(2,Math.ceil(frames.length*.4));let removed=0,images=0;
  const cleaned=frames.map(frame=>({...frame,lines:frame.lines.filter(line=>{
    const numeric=/^\d{1,5}$/u.test(line.text.trim())&&Number(line.text.trim())===frame.page&&margin(line,frame.height);
    const recurring=margin(line,frame.height)&&(occurrences.get(key(line))?.size||0)>=threshold;
    const artifact=tocPages.has(frame.page)||isPaginationArtifact(line.text)||numeric||recurring;
    if(artifact)removed++;return !artifact;
  }),images:frame.images.filter(image=>{
    const repeated=(imagePages.get(image.image)?.size||0)>=threshold;
    const header=image.y>frame.height*.89&&image.height<frame.height*.16;
    const footer=image.y<frame.height*.12&&image.height<frame.height*.16;
    const background=image.width>frame.width*.85&&image.height>frame.height*.85;
    if(tocPages.has(frame.page)||repeated&&(header||footer||background)){images++;return false;}return true;
  })}));
  if(tocPages.size)warnings.push(`${tocPages.size} página(s) de sumário anterior foram identificadas pelas entradas e números; o sumário será recomposto pelo sistema.`);
  if(removed)warnings.push(`${removed} elemento(s) de paginação ou cabeçalho/rodapé recorrente foram excluídos do corpo após conferência da posição nas páginas.`);
  if(images)warnings.push(`${images} imagem(ns) recorrente(s) de identidade visual em cabeçalho ou fundo foram excluídas do conteúdo; a identidade do documento será aplicada pelo sistema.`);
  return cleaned;
}
