import { blockSchema, type DocumentBlock, type SourceDocument } from './document';

const chapterLabel = /^(?:CAP[ÍI]TULO\s+[IVXLCDM\d]+|ANEXO\s+(?:[IVXLCDM\d]+|[ÚU]NICO)|CL[ÁA]USULA\s+[\p{L} -]+)\s*[.:—–-]?$/iu;
const pagination = /^(?:p[áa]g(?:ina)?\.?\s*)?(\d{1,5})\s*(?:de|\/)\s*(\d{1,5})$/iu;
const upperTitle = (text: string) => text.length > 4 && text.length < 350 && /[\p{L}]/u.test(text)
  && text === text.toLocaleUpperCase('pt-BR') && !/^(?:ART\.|§|[IVXLCDM]+\s*[—–-]|\[|CAP[ÍI]TULO|ANEXO|CL[ÁA]USULA|CONSELHO|RESOLU[ÇC][ÃA]O)/u.test(text);

export function isPaginationArtifact(text: string): boolean {
  const match = pagination.exec(text.trim());
  return !!match && Number(match[1]) > 0 && Number(match[1]) <= Number(match[2]);
}
export function isStructuralLabel(text: string): boolean {
  return chapterLabel.test(text.trim()) || /^(?:sum[áa]rio|[íi]ndice|conte[úu]do|apresenta[çc][ãa]o|introdu[çc][ãa]o|resumo executivo|CRA-SP)$/iu.test(text.trim());
}
function normalizedName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s*\(\d+\)$/, '').trim();
}
function usableTitle(value: string | undefined): value is string {
  return !!value?.trim() && value.length > 5 && !isStructuralLabel(value)
    && !/^(?:CONSELHO\s+(?:REGIONAL|FEDERAL)\b|RESOLU[ÇC][ÃA]O\s+(?:NORMATIVA\s+)?[^.]*\bN[º°O](?:\s|$))/iu.test(value)
    && !/^(?:documento\s+sem\s+t[íi]tulo|untitled|document\d*|arquivo\d*)$/iu.test(value.trim());
}
export function inferDocumentMetadata(source: SourceDocument): {title:string; subtitle:string} {
  const core = source.metadata;
  if (usableTitle(core?.title)) return {title:core.title.trim().slice(0,300),subtitle:core?.subject?.trim().slice(0,1000)||''};
  const earlyTitle = source.blocks.slice(0,10).find(block => block.kind === 'paragraph'
    && block.text.length <= 180 && usableTitle(block.text) && block.text.trim().split(/\s+/u).length >= 3
    && !/[.;:]$/u.test(block.text.trim()) && !/^(?:CONSIDERANDO|RESOLVE|O\s+PLEN[ÁA]RIO|Art\.|§)/u.test(block.text));
  if (earlyTitle) return {title:earlyTitle.text.trim().slice(0,300),subtitle:core?.subject?.trim().slice(0,1000)||''};
  const headings = source.blocks.filter(block => block.kind === 'heading');
  const heading = headings.find(block => usableTitle(block.text) && !/^(?:CAP[ÍI]TULO|ANEXO|CL[ÁA]USULA)\b/iu.test(block.text));
  if (heading) return {title:heading.text.trim().slice(0,300),subtitle:core?.subject?.trim().slice(0,1000)||''};
  const subject = source.blocks.slice(0,25).find(block => /^(?:Institui|Regulamenta|Estabelece|Disciplina|Disp[õo]e\s+sobre)\b/iu.test(block.text));
  if (subject) return {title:subject.text.trim().replace(/\.$/u,'').slice(0,300),subtitle:''};
  const filename = normalizedName(source.name);
  if (usableTitle(filename)) return {title:filename.slice(0,300),subtitle:core?.subject?.trim().slice(0,1000)||''};
  const sentence = source.blocks.find(block => block.kind === 'paragraph' && usableTitle(block.text)
    && !/^(?:O\s+PLEN[ÁA]RIO|CONSIDERANDO|RESOLVE|Art\.|§|[IVXLCDM]+\s*[—–-])/u.test(block.text));
  return {title:sentence ? sentence.text.trim().split(/[.!?](?:\s|$)/u)[0].slice(0,180) : 'Documento institucional',subtitle:''};
}

/** Normalize recognized document furniture, keeping the original file hash and reporting every exclusion. */
export function normalizeSource(source: SourceDocument): SourceDocument {
  const warnings = [...source.warnings];
  let removed = 0, merged = 0, reconstructed = 0;
  const plain = withoutGeneratedFrontMatter(source.blocks,warnings).filter(block => {
    if (['paragraph','heading'].includes(block.kind) && isPaginationArtifact(block.text)) { removed++; return false; }
    return true;
  });
  const blocks: DocumentBlock[] = [];
  for (let index = 0; index < plain.length; index++) {
    const block = plain[index];
    const next = plain[index+1];
    if (chapterLabel.test(block.text.trim()) && next && ['paragraph','heading'].includes(next.kind) && upperTitle(next.text.trim())) {
      const clause = /^CL[ÁA]USULA/iu.test(block.text);
      blocks.push({...block,kind:'heading',text:`${block.text}\n${next.text}`,level:clause?2:1,breakBefore:!clause});
      index++; merged++; continue;
    }
    const recovered = recoverPlaceholderTable(plain,index);
    if (recovered) {blocks.push(recovered.block);index=recovered.end;reconstructed++;continue;}
    if(block.kind==='paragraph'&&/^CL[ÁA]USULA\s+/iu.test(block.text)
      &&block.text.length<350&&block.text===block.text.toLocaleUpperCase('pt-BR')) {
      blocks.push({...block,kind:'heading',level:2});continue;
    }
    blocks.push(block);
  }
  if (removed) warnings.push(`${removed} marca(s) isolada(s) de paginação foram excluídas do corpo; a numeração será gerada novamente.`);
  if (merged) warnings.push(`${merged} título(s) de capítulo, anexo ou cláusula foram reunidos com sua denominação, preservando o texto.`);
  if (reconstructed) warnings.push(`${reconstructed} quadro(s) com campos e condições foram reconstruídos como tabela a partir de linhas fragmentadas; confira a estrutura com o original.`);
  return {...source,blocks:blocks.map(block=>({...block,sourceIds:[block.id]})),warnings:[...new Set(warnings)].slice(0,500)};
}
function recoverPlaceholderTable(blocks: DocumentBlock[], start:number): {block:DocumentBlock;end:number}|null {
  const header=blocks[start];
  const match=/^(CAMPO|ITEM|REQUISITO|CRIT[ÉE]RIO|ETAPA)\s+(CONDI[ÇC][ÃA]O(?: ACORDADA)?|DESCRI[ÇC][ÃA]O|VALOR|INFORMA[ÇC][ÃA]O(?: EXIGIDA)?)$/iu.exec(header.text.trim());
  if (!match || !['paragraph','heading'].includes(header.kind)) return null;
  const rows:string[][]=[[match[1],match[2]]]; let end=start;
  for(let i=start+1;i<blocks.length&&i<start+35;i++) {
    const current=blocks[i];
    if (current.kind!=='paragraph') break;
    const row=/^([^\[\]\n]{2,90}?)\s+(\[[\s\S]*)$/u.exec(current.text);
    if (!row || /^(?:Art\.|§|\d+[.)])/u.test(row[1])) break;
    let value=row[2];let cursor=i;
    while (!value.trim().endsWith(']') && cursor+1<blocks.length && cursor<i+5
      && blocks[cursor+1].kind==='paragraph' && !/^(?:Art\.|§|\d+[.)]|CL[ÁA]USULA)/u.test(blocks[cursor+1].text)) {
      value+=' '+blocks[++cursor].text;
    }
    if (!value.trim().endsWith(']')) break;
    rows.push([row[1],value]);end=cursor;i=cursor;
  }
  if(rows.length<3)return null;
  return {block:blockSchema.parse({...header,kind:'table',text:'',rows}),end};
}

function withoutGeneratedFrontMatter(blocks:DocumentBlock[],warnings:string[]):DocumentBlock[]{
  const excluded=new Set<number>();
  for(let index=0;index<Math.min(20,blocks.length);index++){
    const block=blocks[index];
    if(!/^(?:sum[áa]rio|[íi]ndice)$/iu.test(block.text.trim())||block.kind!=='heading')continue;
    excluded.add(index);let end=index+1;
    while(end<blocks.length&&end<index+60&&chapterLabel.test(blocks[end].text.trim()))end++;
    if(end-index>2)for(let cursor=index+1;cursor<end;cursor++)excluded.add(cursor);
    if(index===1&&blocks[0].kind==='table'&&blocks[0].rows.length===1&&blocks[0].rows[0].length===1
      &&/^CRA-SP\s+(?:CAP[ÍI]TULO|ANEXO)\s+[IVXLCDM\d]+$/iu.test(blocks[0].rows[0][0].trim()))excluded.add(0);
  }
  if(excluded.size)warnings.push(`${excluded.size} elemento(s) de capa ou sumário automático anterior foram excluídos do corpo; esses elementos serão recompostos pelo sistema.`);
  return blocks.filter((_,index)=>!excluded.has(index));
}
