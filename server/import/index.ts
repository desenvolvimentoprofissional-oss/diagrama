import { createHash } from 'node:crypto';
import { extname, basename } from 'node:path';
import { sourceSchema, type SourceDocument } from '../../shared/document';
import { importDocx } from './docx';
import { docxMetadata } from './metadata';
import { normalizeSource } from '../../shared/structure';
import { importPdf } from './pdf';
import { IMPORT_MAX_BYTES, ImportError } from './errors';
export { ImportError } from './errors';

export async function importDocument(buffer: Buffer, filename: string, signal?:AbortSignal): Promise<SourceDocument> {
  signal?.throwIfAborted();
  if (!buffer.length) throw new ImportError('Selecione um arquivo Word ou PDF com conteúdo.');
  if (buffer.length>IMPORT_MAX_BYTES) throw new ImportError('O arquivo excede o limite de 20 MB.',413);
  const extension=extname(filename).toLowerCase();
  const name=basename(filename).slice(0,300);
  const sha256=createHash('sha256').update(buffer).digest('hex');
  if (extension==='.docx') {
    if (buffer.subarray(0,4).toString('hex')!=='504b0304') throw new ImportError('O arquivo enviado não é um Word DOCX válido.');
    const {blocks,warnings}=await importDocx(buffer);
    return normalizeSource(sourceSchema.parse({name,format:'docx',sha256,blocks,warnings,pageCount:0,ocr:false,metadata:await docxMetadata(buffer)}));
  }
  if (extension==='.pdf') {
    if (!buffer.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw new ImportError('O arquivo enviado não é um PDF válido.');
    const {blocks,warnings,pageCount,requiresOcr,metadata}=await importPdf(buffer,signal);
    if (requiresOcr) {
      const {ocrPdf}=await import('../ai/index');
      return normalizeSource({...await ocrPdf(buffer,name,signal,pageCount),metadata});
    }
    if (!blocks.length) throw new ImportError('O PDF não contém texto ou imagens reconhecíveis.');
    return normalizeSource(sourceSchema.parse({name,format:'pdf',sha256,blocks,warnings,pageCount,ocr:false,metadata}));
  }
  throw new ImportError('Formato não aceito. Envie um arquivo .docx ou .pdf.');
}
