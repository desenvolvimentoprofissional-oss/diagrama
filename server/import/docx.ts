import mammoth from 'mammoth';
import { blocksFromHtml } from './html';
import { validateDocxArchive } from './archive';
import { ImportError } from './errors';
import { importImage } from './images';
import type { DocumentBlock } from '../../shared/document';

export async function importDocx(buffer: Buffer): Promise<{blocks:DocumentBlock[]; warnings:string[]}> {
  await validateDocxArchive(buffer);
  const warnings: string[] = [];
  const result = await mammoth.convertToHtml({buffer}, {
    externalFileAccess: false,
    includeDefaultStyleMap: true,
    ignoreEmptyParagraphs: false,
    styleMap: [
      "p[style-name='Título'] => h1:fresh",
      "p[style-name='Título 1'] => h1:fresh",
      "p[style-name='Título 2'] => h2:fresh",
      "p[style-name='Título 3'] => h3:fresh",
      "p[style-name='Title'] => h1:fresh",
    ],
    convertImage: mammoth.images.imgElement(async image => {
      const mime = image.contentType;
      if (!['image/png','image/jpeg','image/gif','image/webp'].includes(mime)) {
        warnings.push('Uma imagem em formato não compatível não foi incorporada; confira o original.');
        return {src:''};
      }
      const data = await image.read('base64');
      if (data.length > 16_000_000) throw new ImportError('Uma imagem do Word excede o limite de importação.');
      return {src:await importImage(Buffer.from(data,'base64'),warnings)};
    }),
  });
  if (result.messages.length) warnings.push('O Word contém estilos ou elementos que exigem conferência com o original.');
  warnings.push('A importação preserva o texto e a estrutura reconhecida; cabeçalhos, rodapés, caixas de texto, equações e marcações de revisão devem ser conferidos no original.');
  const blocks = blocksFromHtml(result.value);
  if (!blocks.length) throw new ImportError('O Word não contém texto ou imagens reconhecíveis para diagramação.');
  return {blocks, warnings:[...new Set(warnings)]};
}
