import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { blockSchema, type DocumentBlock } from '../../shared/document';
import { ImportError, IMPORT_MAX_BLOCKS, IMPORT_MAX_TEXT } from './errors';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : [];
const tag = (node: Node): string => 'tagName' in node ? node.tagName : '';
const attr = (node: Node, name: string): string => 'attrs' in node ? node.attrs.find(a => a.name === name)?.value || '' : '';
function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  if (tag(node) === 'br') return '\n';
  if (['script', 'style', 'img'].includes(tag(node))) return '';
  return children(node).map(textOf).join('');
}
function descendants(node: Node, match: string): Node[] {
  return children(node).flatMap(child => tag(child) === match ? [child] : descendants(child, match));
}
function ownText(node: Node): string {
  return children(node).filter(child => !['ul','ol'].includes(tag(child))).map(textOf).join('').trim();
}

export function blocksFromHtml(html: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let textCount = 0;
  function add(kind: DocumentBlock['kind'], text: string, other: Partial<DocumentBlock> = {}) {
    if (!text.trim() && !['image','table'].includes(kind)) return;
    const id = `s-${String(blocks.length + 1).padStart(5, '0')}`;
    textCount += text.length + (other.rows?.flat().join('').length || 0);
    if (blocks.length >= IMPORT_MAX_BLOCKS || textCount > IMPORT_MAX_TEXT) {
      throw new ImportError('O conteúdo do documento excede o limite de importação.');
    }
    const isChapter = kind === 'paragraph' && /^(?:CAP[ÍI]TULO|ANEXO)\s+[IVXLCDM\d]+(?:\s|$)/iu.test(text) && text.length < 350;
    blocks.push(blockSchema.parse({id, kind:isChapter ? 'heading' : kind, text, sourceIds:[id],
      ...other, ...(isChapter ? {level:1,breakBefore:true} : {})}));
  }
  function image(node: Node) {
    const src = attr(node, 'src');
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) return;
    add('image', '', {image:src, caption:attr(node, 'alt')});
  }
  function visit(node: Node, listLevel = 1) {
    const name = tag(node);
    if (['script','style'].includes(name)) return;
    if (name === 'table') {
      const rows = descendants(node, 'tr').map(row => children(row).filter(cell => ['td','th'].includes(tag(cell)))
        .map(cell => children(cell).map(textOf).join('\n').trim()));
      if (rows.length) add('table', '', {rows});
      for (const img of descendants(node, 'img')) image(img);
      return;
    }
    if (name === 'img') return image(node);
    if (name === 'li') {
      add('list', ownText(node), {level:Math.min(6,listLevel)});
      for (const child of children(node)) {
        if (['ul','ol'].includes(tag(child))) for (const item of children(child)) visit(item, listLevel+1);
        else for (const img of descendants(child, 'img')) image(img);
      }
      return;
    }
    if (/^h[1-6]$/.test(name) || name === 'p') {
      const kind = name === 'p' ? 'paragraph' : 'heading';
      const level = kind === 'heading' ? Number(name[1]) : 1;
      // Preserve inline image placement by splitting only the surrounding text runs.
      const hasImages = descendants(node, 'img').length > 0;
      if (!hasImages) return add(kind, textOf(node).trim(), {level});
      let accumulated = '';
      const inline = (child: Node) => {
        if (tag(child) === 'img') { add(kind, accumulated.trim(), {level}); accumulated=''; image(child); return; }
        if (child.nodeName === '#text' || tag(child) === 'br') accumulated += textOf(child);
        else children(child).forEach(inline);
      };
      children(node).forEach(inline);
      add(kind, accumulated.trim(), {level});
      return;
    }
    for (const child of children(node)) visit(child, listLevel);
  }
  const fragment = parseFragment(html);
  children(fragment).forEach(node => visit(node));
  return blocks;
}
