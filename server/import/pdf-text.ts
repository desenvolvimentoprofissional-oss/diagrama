import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { DocumentBlock } from '../../shared/document';
export type TextParagraph = {x:number; y:number; kind:DocumentBlock['kind']; text:string; level:number};
type Word = {text:string; x:number; y:number; width:number; height:number; end:boolean};
type Line = {x:number; y:number; right:number; text:string; height:number};

function textLines(content: TextContent): Line[] {
  const words: Word[]=content.items.filter((item):item is TextItem=>'str' in item)
    .filter(item=>item.str.trim().length>0).map(item=>({text:item.str,x:item.transform[4],y:item.transform[5],
      width:item.width,height:Math.max(1,item.height || Math.abs(item.transform[3])),end:item.hasEOL}));
  const groups: Word[][]=[];
  for (const word of [...words].sort((a,b)=>b.y-a.y || a.x-b.x)) {
    const group=groups.find(g=>Math.abs(g[0].y-word.y)<Math.max(2,word.height*.18));
    if (group) group.push(word); else groups.push([word]);
  }
  return groups.map(group=>{
    group.sort((a,b)=>a.x-b.x);
    let text=''; let right=group[0].x;
    for (const word of group) {
      const gap=word.x-right;
      if (text && gap>word.height*.12 && !text.endsWith(' ') && !word.text.startsWith(' ')) text+=' ';
      text+=word.text; right=word.x+word.width;
    }
    return {x:group[0].x,y:group[0].y,right,text:text.trim(),height:Math.max(...group.map(w=>w.height))};
  }).sort((a,b)=>b.y-a.y || a.x-b.x);
}
function isLegalStart(text:string) {
  return /^(?:Art\.\s*\d|§\s*\d|Parágrafo único\.|[IVXLCDM]+\s*[—–−-]|[a-z]\)\s)/u.test(text);
}
function heading(line:Line, base:number):boolean {
  return /^(?:CAP[ÍI]TULO|ANEXO)\s+[IVXLC\d]+(?:\b|$)/iu.test(line.text)
    || (line.height>base*1.28 && line.text.length<180 && !isLegalStart(line.text));
}

export function paragraphsFromPdf(content: TextContent): TextParagraph[] {
  const lines=textLines(content);
  if (!lines.length) return [];
  const heights=lines.map(line=>line.height).sort((a,b)=>a-b);
  const base=heights[Math.floor(heights.length/2)];
  const paragraphs: TextParagraph[]=[];
  let prior: Line|undefined;
  for (const line of lines) {
    const isHeading=heading(line,base);
    const previous=paragraphs.at(-1);
    const canJoin=prior && previous && previous.kind==='paragraph' && !isHeading && !isLegalStart(line.text)
      && prior.y-line.y <= Math.max(prior.height,line.height)*1.6
      && Math.abs(prior.x-line.x)<base*2.5
      && !/^[-•●]\s/.test(line.text);
    if (canJoin) previous.text+=' '+line.text;
    else paragraphs.push({x:line.x,y:line.y,kind:isHeading?'heading':'paragraph',text:line.text,level:1});
    prior=line;
  }
  return paragraphs;
}
