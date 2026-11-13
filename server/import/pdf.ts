import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { blockSchema, type DocumentBlock } from '../../shared/document';
import { ImportError, IMPORT_MAX_BLOCKS, IMPORT_MAX_PAGES, IMPORT_MAX_TEXT } from './errors';
import { extractPdfImages } from './pdf-images';
import { paragraphsFromPdf } from './pdf-text';

export async function importPdf(buffer: Buffer): Promise<{
  blocks:DocumentBlock[]; warnings:string[]; pageCount:number; requiresOcr:boolean;
}> {
  Object.assign(globalThis, {DOMMatrix, ImageData, Path2D});
  const {getDocument, OPS} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,
    stopAtErrors:true,disableFontFace:true,maxImageSize:40_000_000,verbosity:0});
  try {
    const pdf=await task.promise;
    if (pdf.numPages>IMPORT_MAX_PAGES) throw new ImportError(`O PDF excede o limite de ${IMPORT_MAX_PAGES} páginas.`);
    const blocks: DocumentBlock[]=[];
    const warnings:string[]=[];
    const imageCache=new Map<string,string>();
    let requiresOcr=false, textCount=0, imageBytes=0;
    for (let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++) {
      const page=await pdf.getPage(pageNumber);
      const text=paragraphsFromPdf(await page.getTextContent());
      const {images,hasGraphics}=await extractPdfImages(page,OPS,warnings,imageCache);
      const chars=text.reduce((total,item)=>total+item.text.trim().length,0);
      if (chars<8 && (images.length>0 || hasGraphics)) requiresOcr=true;
      const entries=[...text.map(item=>({...item,image:''})),
        ...images.map(item=>({...item,kind:'image' as const,text:'',level:1}))]
        .sort((a,b)=>b.y-a.y || a.x-b.x);
      for (const item of entries) {
        textCount+=item.text.length; imageBytes+=item.image.length;
        if (blocks.length>=IMPORT_MAX_BLOCKS || textCount>IMPORT_MAX_TEXT || imageBytes>24_000_000) {
          throw new ImportError('O conteúdo do PDF excede o limite de importação.');
        }
        const id=`s-${String(blocks.length+1).padStart(5,'0')}`;
        blocks.push(blockSchema.parse({id,kind:item.kind,sourceIds:[id],text:item.text,
          level:item.level,image:item.image,sourcePage:pageNumber}));
      }
      page.cleanup();
    }
    warnings.push('O PDF não preserva necessariamente a estrutura de parágrafos e tabelas. Confira a ordem de leitura, tabelas, símbolos, cabeçalhos e rodapés com o original.');
    return {blocks,warnings:[...new Set(warnings)].slice(0,499),pageCount:pdf.numPages,requiresOcr};
  } catch(error) {
    if (error instanceof ImportError) throw error;
    if (error instanceof Error && error.name==='PasswordException') {
      throw new ImportError('O PDF exige senha. Envie uma cópia sem proteção para importar.');
    }
    throw new ImportError('Não foi possível ler o PDF. Confira se o arquivo está íntegro e sem proteção.');
  } finally {
    await task.destroy();
  }
}
