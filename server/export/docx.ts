import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun,
  Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell,
  TableOfContents, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DocumentBlock, DocumentProject } from '../../shared/document';

type Content = Paragraph | Table | TableOfContents;
const FONT = 'Libre Franklin';
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 5, color: 'DCE2EA' };
const mm = (value: number) => Math.round(value * 56.6929134);
const color = (hex: string) => hex.slice(1);

async function fontFile(name: string): Promise<Buffer> {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(directory, 'fonts', name),
    path.resolve(directory, '../../public/fonts', name),
    path.resolve(process.cwd(), 'public/fonts', name), path.resolve(process.cwd(), 'dist/fonts', name)];
  for (const candidate of candidates) {
    try { return await readFile(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  throw new Error(`Fonte necessária à exportação Word não encontrada: ${name}`);
}

async function embeddedFonts() {
  const [data, bold] = await Promise.all([
    fontFile('LibreFranklin-Regular.ttf'), fontFile('LibreFranklin-Bold.ttf'),
  ]);
  return [{ name: FONT, data, bold }];
}

function runs(text: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => [
    ...(index ? [new TextRun({ break: 1 })] : []),
    new TextRun({ text: line, font: FONT, ...options }),
  ]);
}

function paragraph(text: string, options: ConstructorParameters<typeof Paragraph>[0] = {}) {
  const settings = typeof options === 'string' ? {} : options;
  return new Paragraph({ children: runs(text), widowControl: true, ...settings });
}

function nativeTable(rows: string[][], project: DocumentProject) {
  const count = Math.max(1, ...rows.map(row => row.length));
  const primary = color(project.theme.primary);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array.from({ length: count }, () => Math.floor(mm(170) / count)),
    rows: rows.map((row, index) => new TableRow({
      tableHeader: index === 0,
      children: Array.from({ length: count }, (_, col) => new TableCell({
        shading: index === 0 ? { type: ShadingType.CLEAR, fill: primary } : undefined,
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders: { top: TABLE_BORDER, bottom: TABLE_BORDER, left: TABLE_BORDER, right: TABLE_BORDER },
        children: [new Paragraph({
          children: runs(row[col] || '', { bold: index === 0, color: index === 0 ? 'FFFFFF' : '23344A', size: 20 }),
          spacing: { after: 0, before: 0, line: 280 },
        })],
      })),
    })),
  });
}

function cards(block: DocumentBlock, project: DocumentProject): Content[] {
  const primary = color(project.theme.primary);
  const result: Content[] = block.text ? [paragraph(block.text, { spacing: { after: 160 } })] : [];
  block.items.forEach((item, index) => {
    if (block.kind === 'steps' && index) {
      result.push(paragraph('↓', { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } }));
    }
    result.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: 'F1F4F8' },
        margins: { top: 150, bottom: 150, left: 200, right: 200 },
        borders: {
          left: { style: BorderStyle.SINGLE, size: 24, color: color(project.theme.accent) },
          top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER,
        },
        children: [
          new Paragraph({ children: runs(item.title, { bold: true, color: primary, size: 23 }),
            keepNext: true, spacing: { after: 90, line: 300 } }),
          paragraph(item.text, { spacing: { after: 0, line: 320 } }),
        ],
      })] })],
    }));
    result.push(paragraph('', { spacing: { after: 80, line: 80 } }));
  });
  return result;
}

async function image(dataUrl: string, maxWidth = 642, maxHeight = 610) {
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(dataUrl)) {
    throw new Error('A imagem deve ser um arquivo PNG, JPEG, WEBP ou GIF enviado pelo editor.');
  }
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (bytes.length > 12 * 1024 * 1024) throw new Error('A imagem excede o limite de exportação.');
  const decoded = await loadImage(bytes);
  if (decoded.width * decoded.height > 40_000_000) throw new Error('A imagem possui dimensões excessivas.');
  const scale = Math.min(maxWidth / decoded.width, maxHeight / decoded.height, 1);
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(decoded, 0, 0, width, height);
  return new ImageRun({ type: 'png', data: canvas.toBuffer('image/png'), transformation: { width, height } });
}

async function blockContents(block: DocumentBlock, project: DocumentProject): Promise<Content[]> {
  const contents: Content[] = [];
  if (block.breakBefore) contents.push(new Paragraph({ children: [new PageBreak()] }));
  if (block.kind === 'heading') {
    const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
    contents.push(paragraph(block.text, { heading: levels[block.level - 1], keepNext: true }));
  } else if (block.kind === 'table') {
    if (block.text) contents.push(paragraph(block.text, { keepNext: true }));
    if (block.rows.length) contents.push(nativeTable(block.rows, project));
  } else if (block.kind === 'cards' || block.kind === 'steps') {
    contents.push(...cards(block, project));
  } else if (block.kind === 'image') {
    if (block.text) contents.push(paragraph(block.text));
    if (block.image) contents.push(new Paragraph({ children: [await image(block.image)], alignment: AlignmentType.CENTER }));
  } else if (block.kind === 'callout') {
    contents.push(paragraph(block.text, {
      shading: { type: ShadingType.CLEAR, fill: 'F1F4F8' },
      border: { left: { style: BorderStyle.SINGLE, color: color(project.theme.accent), size: 20, space: 12 } },
      spacing: { before: 100, after: 180, line: 330 },
    }));
  } else {
    contents.push(paragraph(block.text, block.kind === 'list' ? { indent: { left: 260, hanging: 0 } } : {}));
  }
  if (block.caption) contents.push(new Paragraph({
    children: runs(block.caption, { size: 18, color: '607087' }),
    spacing: { before: 60, after: 180 },
  }));
  return contents;
}

async function cover(project: DocumentProject): Promise<Content[]> {
  const primary = color(project.theme.primary);
  const children: Paragraph[] = [];
  if (project.theme.logo) children.push(new Paragraph({ children: [await image(project.theme.logo, 150, 100)],
    spacing: { after: 650 } }));
  children.push(paragraph(project.theme.organization, { children: runs(project.theme.organization,
    { color: 'FFFFFF', size: 24, bold: true }), spacing: { before: 600, after: 700 } }));
  children.push(paragraph(project.title, { children: runs(project.title, { color: 'FFFFFF', size: 60, bold: true }),
    spacing: { after: 550, line: 720 } }));
  if (project.subtitle) children.push(paragraph(project.subtitle, { children: runs(project.subtitle,
    { color: 'FFFFFF', size: 28 }), spacing: { after: 800, line: 380 } }));
  if (project.author) children.push(paragraph(project.author, { children: runs(project.author,
    { color: 'FFFFFF', size: 22 }), spacing: { after: 500 } }));
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: primary },
      margins: { top: 700, bottom: 900, left: 550, right: 550 },
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
      children,
    })] })] }), new Paragraph({ children: [new PageBreak()] })];
}

function assertXmlText(project: DocumentProject) {
  const texts = [project.title, project.subtitle, project.author, project.theme.organization,
    ...project.blocks.flatMap(block => [block.text, block.caption, ...block.rows.flat(),
      ...block.items.flatMap(item => [item.title, item.text])])];
  if (texts.some(text => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text))) {
    throw new Error('O texto contém caracteres incompatíveis com o Word. Revise os caracteres de controle.');
  }
}

export async function exportDocx(project: DocumentProject): Promise<Buffer> {
  const primary = color(project.theme.primary);
  assertXmlText(project);
  const children: Content[] = project.cover ? await cover(project) : [];
  if (project.toc && project.blocks.some(block => block.kind === 'heading')) {
    children.push(paragraph('Sumário', { heading: HeadingLevel.TITLE }));
    children.push(new TableOfContents('', { hyperlink: true, headingStyleRange: '1-3' }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  for (const block of project.blocks) children.push(...await blockContents(block, project));
  const headerChildren: Paragraph[] = [new Paragraph({
    children: runs(project.title, { size: 16, color: primary }),
    border: { bottom: { style: BorderStyle.DOTTED, size: 5, color: 'C5CED9', space: 8 } },
    spacing: { after: 100 },
  })];
  const doc = new Document({
    title: project.title, subject: project.subtitle, creator: project.author || project.theme.organization,
    description: 'Documento editável produzido no Diagrama.ai.',
    features: { updateFields: true },
    fonts: await embeddedFonts(),
    styles: {
      default: { document: { run: { font: FONT, size: project.theme.fontSize * 2, color: '23344A' },
        paragraph: { spacing: { after: 150, before: 0, line: 340 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 48, bold: true, color: primary }, paragraph: { keepNext: true, spacing: { after: 360 } } },
        ...[1, 2, 3, 4, 5, 6].map(level => ({ id: `Heading${level}`, name: `heading ${level}`,
          basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: Math.max(22, 40 - level * 4), bold: true, color: primary },
          paragraph: { keepNext: true, keepLines: true, outlineLevel: level - 1,
            spacing: { before: level === 1 ? 350 : 220, after: 170, line: 400 } },
        })),
      ],
    },
    sections: [{
      properties: { titlePage: project.cover,
        page: { size: { width: mm(210), height: mm(297) },
          margin: { top: mm(28), right: mm(20), bottom: mm(24), left: mm(20), header: mm(12), footer: mm(12) } } },
      headers: { default: new Header({ children: headerChildren }),
        ...(project.cover ? { first: new Header({ children: [paragraph('')] }) } : {}) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: `${project.theme.organization}  ·  `, font: FONT, size: 16, color: '607087' }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: primary })],
      })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
