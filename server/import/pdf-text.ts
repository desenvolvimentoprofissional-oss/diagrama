import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { DocumentBlock } from '../../shared/document';
export type TextParagraph = {x:number; y:number; kind:DocumentBlock['kind']; text:string; level:number; rows?:string[][]};
export type PdfSegment={x:number;right:number;text:string;height:number};
export type PdfLine={x:number;y:number;right:number;text:string;height:number;segments:PdfSegment[]};
type Word={text:string;x:number;y:number;width:number;height:number};

export function pdfTextLines(content:TextContent):PdfLine[] {
  const words:Word[]=content.items.filter((item):item is TextItem=>'str' in item)
    .filter(item=>item.str.trim().length>0).map(item=>({text:item.str,x:item.transform[4],y:item.transform[5],
      width:item.width,height:Math.max(1,item.height||Math.abs(item.transform[3]))}));
  const groups:Word[][]=[];
  for(const word of [...words].sort((a,b)=>b.y-a.y||a.x-b.x)){
    const group=groups.find(group=>Math.abs(group[0].y-word.y)<Math.max(2,word.height*.18));
    if(group)group.push(word);else groups.push([word]);
  }
  return groups.map(group=>{
    group.sort((a,b)=>a.x-b.x);const segments:PdfSegment[]=[];
    for(const word of group){
      const last=segments.at(-1),gap=last?word.x-last.right:0;
      if(!last||gap>Math.max(16,word.height*1.7))segments.push({x:word.x,right:word.x+word.width,text:word.text,height:word.height});
      else{last.text+=(gap>word.height*.12&&!last.text.endsWith(' ')&&!word.text.startsWith(' ')?' ':'')+word.text;
        last.right=Math.max(last.right,word.x+word.width);last.height=Math.max(last.height,word.height);}
    }
    return {x:group[0].x,y:group[0].y,right:Math.max(...segments.map(segment=>segment.right)),
      text:segments.map(segment=>segment.text.trim()).join(' '),height:Math.max(...group.map(word=>word.height)),segments};
  }).sort((a,b)=>b.y-a.y||a.x-b.x);
}
function isLegalStart(text:string){
  return /^(?:Art\.\s*\d|§\s*\d|Parágrafo único\.|[IVXLCDM]+\s*[—–−-]|[a-z]\)\s)/u.test(text);
}
function heading(line:PdfLine,base:number):boolean {
  return /^(?:CAP[ÍI]TULO|ANEXO)\s+[IVXLC\d]+(?:\b|$)/iu.test(line.text)
    ||(line.height>base*1.28&&line.text.length<180&&!isLegalStart(line.text));
}
export function paragraphsFromLines(lines:PdfLine[]):TextParagraph[] {
  if(!lines.length)return [];
  const heights=lines.map(line=>line.height).sort((a,b)=>a-b),base=heights[Math.floor(heights.length/2)];
  const paragraphs:TextParagraph[]=[];let prior:PdfLine|undefined;
  for(const line of lines){
    const isHeading=heading(line,base),previous=paragraphs.at(-1);
    const canJoin=prior&&previous&&previous.kind==='paragraph'&&!isHeading&&!isLegalStart(line.text)
      &&prior.y-line.y<=Math.max(prior.height,line.height)*1.6&&Math.abs(prior.x-line.x)<base*2.5&&!/^[-•●]\s/.test(line.text);
    if(canJoin)previous.text+=(previous.text.endsWith('-')&&/^[\p{L}]/u.test(line.text)?'':' ')+line.text;
    else paragraphs.push({x:line.x,y:line.y,kind:isHeading?'heading':'paragraph',text:line.text,level:1});
    prior=line;
  }
  return paragraphs;
}
export function paragraphsFromPdf(content:TextContent):TextParagraph[]{return paragraphsFromLines(pdfTextLines(content));}
