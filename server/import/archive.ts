import * as yauzl from 'yauzl';
import { ImportError } from './errors';

/** Validate ZIP metadata before mammoth inflates any DOCX member. */
export function validateDocxArchive(buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(new ImportError('O arquivo Word está corrompido ou não é um DOCX válido.'));
      let total = 0;
      let entries = 0;
      let documentFound = false;
      let contentTypesFound = false;
      let closed = false;
      let activeStream: import('node:stream').Readable | undefined;
      let inflatedTotal = 0;
      const fail = (message: string) => {
        if (closed) return;
        closed = true;
        activeStream?.destroy();
        zip.close();
        reject(new ImportError(message));
      };
      zip.on('error', () => fail('Não foi possível ler a estrutura do arquivo Word.'));
      zip.on('entry', (entry: yauzl.Entry) => {
        total += entry.uncompressedSize;
        entries++;
        if (entries > 3000 || total > 80 * 1024 * 1024 || entry.uncompressedSize > 24 * 1024 * 1024) {
          return fail('O conteúdo descompactado do Word excede o limite de importação.');
        }
        if (entry.generalPurposeBitFlag & 1) return fail('Arquivos Word criptografados não são aceitos.');
        if (entry.fileName.includes('..') || entry.fileName.startsWith('/') || entry.fileName.includes('\\')) {
          return fail('O arquivo Word contém um caminho de arquivo inválido.');
        }
        if (entry.uncompressedSize > 1024 * 1024 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 1000) {
          return fail('A compactação do Word excede os limites seguros de importação.');
        }
        if (entry.fileName === 'word/document.xml') documentFound = true;
        if (entry.fileName === '[Content_Types].xml') contentTypesFound = true;
        if (entry.fileName.endsWith('/')) {zip.readEntry();return;}
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail('Não foi possível validar o conteúdo compactado do Word.');
          activeStream = stream;
          let actualSize = 0;
          stream.on('data', (chunk: Buffer) => {
            actualSize += chunk.length; inflatedTotal += chunk.length;
            if (actualSize > entry.uncompressedSize || actualSize > 24 * 1024 * 1024
              || inflatedTotal > 80 * 1024 * 1024) fail('O conteúdo descompactado do Word excede o limite de importação.');
          });
          stream.on('error', () => fail('A estrutura compactada do Word está inválida.'));
          stream.on('end', () => {activeStream = undefined;if (!closed) zip.readEntry();});
        });
      });
      zip.on('end', () => {
        if (closed) return;
        closed = true;
        if (!documentFound || !contentTypesFound) return reject(new ImportError('O arquivo ZIP não contém um documento Word.'));
        resolve();
      });
      zip.readEntry();
    });
  });
}
