import { paragraphsFromLines, type PdfLine, type TextParagraph } from './pdf-text';
const tableHeading=/^(?:CAMPO|ITEM|REQUISITO|ELEMENTO|COMPONENTE|MAT[ÉE]RIA|DIMENS[ÃA]O|ASPECTO|CRIT[ÉE]RIO|ETAPA|ATIVIDADE|RESPONS[ÁA]VEL|INDICADOR|TIPO|DATA|NOME|FASE|M[ÓO]DULO|OBJETIVO|RECURSO|DESCRI[ÇC][ÃA]O|CONDI[ÇC][ÃA]O)\b/iu;

function tableFrom(lines:PdfLine[],start:number):{entry:TextParagraph;end:number}|null {
  const header=lines[start];
  if(header.segments.length<2||header.segments.length>6||!tableHeading.test(header.segments[0].text.trim()))return null;
  const anchors=header.segments.map(segment=>segment.x);
  if(anchors.some((anchor,index)=>index>0&&anchor-anchors[index-1]<50))return null;
  const rows= [header.segments.map(segment=>segment.text.trim())];
  let end=start,last=header;
  for(let i=start+1;i<lines.length&&i<start+150;i++){
    const line=lines[i],gap=last.y-line.y;
    if(gap<0||gap>Math.max(last.height,line.height)*3.5||line.height>header.height*1.6)break;
    const cells=Array.from({length:anchors.length},()=> '');
    let aligned=true;
    for(const segment of line.segments){
      let col=anchors.findIndex((anchor,index)=>segment.x>=anchor-12&&(index===anchors.length-1||segment.x<anchors[index+1]-12));
      if(col<0){aligned=false;break;}
      cells[col]+=(cells[col]?' ':'')+segment.text.trim();
    }
    if(!aligned)break;
    const count=cells.filter(Boolean).length;
    const previous=rows.at(-1)!;
    const continuation=rows.length>1&&gap<=Math.max(last.height,line.height)*1.6
      && cells[0] && (/^[\p{Ll}]/u.test(cells[0])||/(?:[-–]|\b(?:de|do|da|e|ou|para|a|o))$/iu.test(previous[0]));
    if(continuation)cells.forEach((cell,col)=>{if(cell)previous[col]+=(previous[col]?(previous[col].endsWith('-')&&/^[\p{L}]/u.test(cell)?'':'\n'):'')+cell;});
    else if(cells[0]&&count<2)break;
    else if(cells[0])rows.push(cells);
    else if(count&&rows.length>1)cells.forEach((cell,col)=>{if(cell)rows[rows.length-1][col]+=(rows[rows.length-1][col]?(rows[rows.length-1][col].endsWith('-')&&/^[\p{L}]/u.test(cell)?'':'\n'):'')+cell;});
    else break;
    end=i;last=line;
  }
  if(rows.length<2)return null;
  return {entry:{x:header.x,y:header.y,kind:'table',text:'',level:1,rows},end};
}
/** Reconstruct a table only when an explicit header and repeated column positions agree. */
export function pdfSemanticEntries(lines:PdfLine[]):{entries:TextParagraph[];tables:number} {
  const entries:TextParagraph[]=[];let plain:PdfLine[]=[],tables=0;
  const flush=()=>{entries.push(...paragraphsFromLines(plain));plain=[];};
  for(let index=0;index<lines.length;index++){
    const table=tableFrom(lines,index);
    if(table){flush();entries.push(table.entry);index=table.end;tables++;}
    else plain.push(lines[index]);
  }
  flush();return {entries,tables};
}
