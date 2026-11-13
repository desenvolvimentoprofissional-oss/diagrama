import { createHash } from 'node:crypto';
import { extname, basename } from 'node:path';
import { sourceSchema, type SourceDocument } from '../../shared/document';
import { importDocx } from './docx';
import { importPdf } from './pdf';
import { IMPORT_MAX_BYTES, ImportError } from './errors';
export { ImportError } from './errors';

export async function importDocument(buffer: Buffer, filename: string): Promise<SourceDocument> {
  if (!buffer.length) throw new ImportError('Selecione um arquivo Word ou PDF com conteúdo.');
  if (buffer.length>IMPORT_MAX_BYTES) throw new ImportError('O arquivo excede o limite de 20 MB.',413);
  const extension=extname(filename).toLowerCase();
  const name=basename(filename).slice(0,300);
  const sha256=createHash('sha256').update(buffer).digest('hex');
  if (extension==='.docx') {
    if (buffer.subarray(0,4).toString('hex')!=='504b0304') throw new ImportError('O arquivo enviado não é um Word DOCX válido.');
    const {blocks,warnings}=await importDocx(buffer);
    return sourceSchema.parse({name,format:'docx',sha256,blocks,warnings,pageCount:0,ocr:false});
  }
  if (extension==='.pdf') {
    if (!buffer.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw new ImportError('O arquivo enviado não é um PDF válido.');
    const {blocks,warnings,pageCount,requiresOcr}=await importPdf(buffer);
    if (requiresOcr) {
      const {ocrPdf}=await import('../ai/index');
      return ocrPdf(buffer,name,undefined,pageCount);
    }
    if (!blocks.length) throw new ImportError('O PDF não contém texto ou imagens reconhecíveis.');
    return sourceSchema.parse({name,format:'pdf',sha256,blocks,warnings,pageCount,ocr:false});
  }
  throw new ImportError('Formato não aceito. Envie um arquivo .docx ou .pdf.');
}
