import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { blockSchema, type SourceDocument, type DocumentBlock } from '../../shared/document';
import { ImportError, IMPORT_MAX_BLOCKS, IMPORT_MAX_PAGES, IMPORT_MAX_TEXT } from './errors';
import { extractPdfImages } from './pdf-images';
import { pdfTextLines } from './pdf-text';
import { pdfSemanticEntries } from './pdf-tables';
import { cleanPdfFurniture, type PdfFrame } from './pdf-furniture';

export async function importPdf(buffer:Buffer,signal?:AbortSignal):Promise<{
  blocks:DocumentBlock[];warnings:string[];pageCount:number;requiresOcr:boolean;metadata?:SourceDocument['metadata'];
}> {
  Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
  const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,
    stopAtErrors:true,disableFontFace:true,maxImageSize:40_000_000,verbosity:0});
  try{
    const pdf=await task.promise;
    if(pdf.numPages>IMPORT_MAX_PAGES)throw new ImportError(`O PDF excede o limite de ${IMPORT_MAX_PAGES} páginas.`);
    const info:Record<string,unknown> = await pdf.getMetadata()
      .then(value=>value.info as Record<string,unknown>).catch(()=>({}));
    const metadata:NonNullable<SourceDocument['metadata']>={};
    if(typeof info.Title==='string')metadata.title=info.Title.trim().slice(0,1000);
    if(typeof info.Subject==='string')metadata.subject=info.Subject.trim().slice(0,2000);
    if(typeof info.Author==='string')metadata.author=info.Author.trim().slice(0,500);
    const blocks:DocumentBlock[]=[],warnings:string[]=[],frames:PdfFrame[]=[];
    const imageCache=new Map<string,string>();
    for(let number=1;number<=pdf.numPages;number++){
      signal?.throwIfAborted();
      const page=await pdf.getPage(number),view=page.getViewport({scale:1});
      const lines=pdfTextLines(await page.getTextContent());
      const {images,hasGraphics}=await extractPdfImages(page,OPS,warnings,imageCache);
      frames.push({page:number,width:view.width,height:view.height,lines,images,hasGraphics});page.cleanup();
    }
    let requiresOcr=false,textCount=0,imageBytes=0,tables=0;
    for(const frame of cleanPdfFurniture(frames,warnings)){
      const parsed=pdfSemanticEntries(frame.lines);tables+=parsed.tables;
      const chars=frame.lines.reduce((total,line)=>total+line.text.trim().length,0);
      if(chars<8&&frame.images.some(image=>image.width*image.height>frame.width*frame.height*.1))requiresOcr=true;
      const entries=[...parsed.entries.map(item=>({...item,image:''})),
        ...frame.images.map(item=>({...item,kind:'image' as const,text:'',level:1,rows:[] as string[][]}))]
        .sort((a,b)=>b.y-a.y||a.x-b.x);
      for(const item of entries){
        textCount+=item.text.length+(item.rows?.flat().join('').length||0);imageBytes+=item.image.length;
        if(blocks.length>=IMPORT_MAX_BLOCKS||textCount>IMPORT_MAX_TEXT||imageBytes>24_000_000)
          throw new ImportError('O conteúdo do PDF excede o limite de importação.');
        const id=`s-${String(blocks.length+1).padStart(5,'0')}`;
        blocks.push(blockSchema.parse({id,kind:item.kind,sourceIds:[id],text:item.text,
          rows:item.rows||[],level:item.level,image:item.image,sourcePage:frame.page}));
      }
    }
    if(tables)warnings.push(`${tables} tabela(s) foram reconstruídas pela posição das colunas; confira a estrutura e as células com o PDF original.`);
    warnings.push('O PDF não preserva necessariamente a estrutura semântica. Confira a ordem de leitura, símbolos e tabelas com o original; quadros sem evidência suficiente de colunas permanecem como texto.');
    return {blocks,warnings:[...new Set(warnings)].slice(0,499),pageCount:pdf.numPages,requiresOcr,metadata};
  }catch(error){
    if(signal?.aborted)throw error;
    if(error instanceof ImportError)throw error;
    if(error instanceof Error&&error.name==='PasswordException')throw new ImportError('O PDF exige senha. Envie uma cópia sem proteção para importar.');
    throw new ImportError('Não foi possível ler o PDF. Confira se o arquivo está íntegro e sem proteção.');
  }finally{await task.destroy();}
}
