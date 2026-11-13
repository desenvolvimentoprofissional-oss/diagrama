import { createHash } from 'node:crypto';
import { AlignmentType, BorderStyle, Bookmark, HeadingLevel, ImageRun, LineRuleType, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType, type IParagraphOptions } from 'docx';
import type { DocumentBlock, DocumentProject } from '../../shared/document';
import { FONT, hex, mm, picture } from './docx-assets';
import { validateImage } from '../images';
export type WordContent=Paragraph|Table;
const NONE={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
const noneBorders={top:NONE,bottom:NONE,left:NONE,right:NONE,insideH:NONE,insideV:NONE};
export const anchor=(id:string)=>`dg_${createHash('sha256').update(id).digest('hex').slice(0,32)}`;
export function runs(text:string,style:{bold?:boolean;color?:string;size?:number}={}) {
  return text.split('\n').flatMap((line,index)=>[...(index?[new TextRun({break:1})]:[]),new TextRun({text:line,font:FONT,...style})]);
}
export function paragraph(text:string,options:IParagraphOptions={}) {
  return new Paragraph({children:runs(text),widowControl:true,...options,spacing:{before:0,after:198,line:348,lineRule:LineRuleType.EXACT,...options.spacing}});
}
export function nativeTable(rows:string[][],project:DocumentProject) {
  const count=Math.max(1,...rows.map(row=>row.length));
  const widths=Array.from({length:count},()=>Math.floor(mm(170)/count));
  return new Table({width:{size:mm(170),type:WidthType.DXA},columnWidths:widths,layout:TableLayoutType.FIXED,
    rows:rows.map((row,index)=>new TableRow({tableHeader:index===0,children:widths.map((width,column)=>new TableCell({
      width:{size:width,type:WidthType.DXA},verticalAlign:VerticalAlign.TOP,
      margins:{top:105,bottom:105,left:135,right:135},
      borders:{top:{style:BorderStyle.SINGLE,size:4,color:'D8E1EC'},bottom:{style:BorderStyle.SINGLE,size:4,color:'D8E1EC'},
        left:{style:BorderStyle.SINGLE,size:4,color:'D8E1EC'},right:{style:BorderStyle.SINGLE,size:4,color:'D8E1EC'}},
      shading:{type:ShadingType.CLEAR,fill:index===0?hex(project.theme.primary):index%2?'FFFFFF':'F3F6FA'},
      children:[paragraph(row[column]||'',{children:runs(row[column]||'',{size:18,bold:index===0,color:index===0?'FFFFFF':'293444'}),
        spacing:{before:0,after:0,line:260}})],
    }))})),
  });
}
function cell(title:string,text:string,project:DocumentProject,index?:number,span=1):TableCell {
  const color=hex(project.theme.primary);
  return new TableCell({verticalAlign:VerticalAlign.TOP,rowSpan:span,
    margins:{top:170,bottom:170,left:190,right:190},
    shading:{type:ShadingType.CLEAR,fill:'F3F6FA'},
    borders:{...noneBorders,top:{style:BorderStyle.SINGLE,size:16,color:hex(project.theme.accent)}},
    children:[...(title?[paragraph(`${index===undefined?'':`${String(index+1).padStart(2,'0')} · `}${title}`,
      {children:runs(`${index===undefined?'':`${String(index+1).padStart(2,'0')} · `}${title}`,{bold:true,size:22,color}),
        keepNext:!!text,spacing:{before:0,after:text?85:0,line:280}})]:[]),
      ...(text?[paragraph(text,{children:runs(text,{size:20,color:'35465E'}),spacing:{before:0,after:0,line:280}})]:[])],
  });
}
function grid(items:{title:string;text:string}[],project:DocumentProject,numbered=false,preferredColumns=2):WordContent[] {
  const result:WordContent[]=[];
  const columns=items.length>1&&items.every(item=>item.title.length+item.text.length<460)?Math.min(preferredColumns,items.length):1;
  for(let index=0;index<items.length;index+=columns) {
    const group=items.slice(index,index+columns);const children:TableCell[]=[];
    group.forEach((item,i)=>{if(i)children.push(new TableCell({width:{size:mm(5),type:WidthType.DXA},borders:noneBorders,
      children:[paragraph('',{spacing:{line:20,after:0,before:0}})]}));children.push(cell(item.title,item.text,project,numbered?index+i:undefined));});
    const widths=group.flatMap((_,index)=>[...(index?[mm(5)]:[]),mm((170-(group.length-1)*5)/group.length)]);
    result.push(new Table({width:{size:mm(170),type:WidthType.DXA},columnWidths:widths,layout:TableLayoutType.FIXED,
      borders:noneBorders,rows:[new TableRow({children})]}),paragraph('',{spacing:{before:0,after:0,line:100}}));
  }
  return result;
}
function graph(block:DocumentBlock,project:DocumentProject):WordContent[] {
  const nodes=block.nodes||[];const edges=block.edges||[];
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const result:WordContent[]=[];
  if(!edges.length)return grid(nodes.map(node=>({title:node.label,text:node.detail})),project,false,3);
  const root=nodes.filter(node=>!edges.some(edge=>edge.to===node.id));
  const degrees=nodes.every(node=>edges.filter(edge=>edge.from===node.id).length<=1&&edges.filter(edge=>edge.to===node.id).length<=1);
  const ordered:typeof nodes=[];let cursor=root.length===1?root[0]:undefined;
  while(cursor&&!ordered.some(node=>node.id===cursor!.id)){
    ordered.push(cursor);const edge=edges.find(item=>item.from===cursor!.id);cursor=edge?byId.get(edge.to):undefined;
  }
  if(degrees&&edges.length===nodes.length-1&&ordered.length===nodes.length){
    ordered.forEach((node,index)=>{
      result.push(...grid([{title:`${String(index+1).padStart(2,'0')} · ${node.label}`,text:node.detail}],project));
      const edge=edges.find(item=>item.from===node.id);
      if(edge)result.push(paragraph(edge.label?`${edge.label}  ↓`:'↓',{alignment:AlignmentType.CENTER,
        children:runs(edge.label?`${edge.label}  ↓`:'↓',{size:20,bold:true,color:hex(project.theme.primary)}),
        spacing:{before:0,after:90,line:270}}));
    });
    return result;
  }
  // Each drawn connection corresponds to exactly one supplied edge. No rank-based shared arrows
  // may imply a transition from an unrelated branch or from a terminal node.
  for(const from of nodes){
    const outgoing=edges.filter(edge=>edge.from===from.id);
    if(!outgoing.length)continue;
    const rows=outgoing.map((edge,index)=>{
      const to=byId.get(edge.to);
      if(!to)throw new Error('O infográfico contém uma conexão sem destino.');
      const connector=new TableCell({width:{size:mm(34),type:WidthType.DXA},borders:noneBorders,
        verticalAlign:VerticalAlign.CENTER,margins:{top:100,bottom:100,left:80,right:80},
        children:[...(edge.label?[paragraph(edge.label,{alignment:AlignmentType.CENTER,
          children:runs(edge.label,{size:18,bold:true,color:hex(project.theme.primary)}),spacing:{before:0,after:65,line:235}})]:[]),
          paragraph('→',{alignment:AlignmentType.CENTER,children:runs('→',{size:30,color:hex(project.theme.primary)}),
            spacing:{before:0,after:0,line:340}})]});
      return new TableRow({children:[...(index===0?[cell(from.label,from.detail,project,undefined,outgoing.length)]:[]),
        connector,cell(to.label,to.detail,project)]});
    });
    result.push(new Table({width:{size:mm(170),type:WidthType.DXA},columnWidths:[mm(68),mm(34),mm(68)],
      layout:TableLayoutType.FIXED,borders:noneBorders,rows}),paragraph('',{spacing:{before:0,after:0,line:120}}));
  }
  const connected=new Set(edges.flatMap(edge=>[edge.from,edge.to]));
  result.push(...grid(nodes.filter(node=>!connected.has(node.id)).map(node=>({title:node.label,text:node.detail})),project,false,3));
  return result;
}
export async function blockContents(block:DocumentBlock,project:DocumentProject,continued=false):Promise<WordContent[]> {
  const result:WordContent[]=[];
  if(block.kind==='heading') {
    const levels=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6];
    const content=runs(block.text,{bold:true,color:hex(block.level===2?project.theme.accent:project.theme.primary),
      size:block.level===1?42:block.level===2?28:24});
    result.push(paragraph(block.text,{...(continued?{}:{heading:levels[block.level-1]}),
      children:continued?content:[new Bookmark({id:anchor(block.id),children:content})],
      keepNext:true,spacing:{before:block.level===1?0:100,after:160,line:block.level===1?500:340},
      ...(block.level===1?{border:{left:{style:BorderStyle.SINGLE,size:14,color:hex(project.theme.accent),space:8}}}:{})}));
  } else if(block.kind==='table') {
    if(block.text)result.push(paragraph(block.text,{keepNext:true,children:runs(block.text,{bold:true,size:25,color:hex(project.theme.primary)})}));
    if(block.rows.length)result.push(nativeTable(block.rows,project));
  } else if(['cards','steps','diagram'].includes(block.kind)) {
    if(block.text)result.push(paragraph(block.text,{keepNext:true,children:runs(block.text,{bold:true,size:27,color:hex(project.theme.primary)})}));
    result.push(...(block.kind==='diagram'?graph(block,project):grid(block.items,project,block.kind==='steps')));
  } else if(block.kind==='image') {
    if(block.text)result.push(paragraph(block.text));
    if(block.image){validateImage(block.image);result.push(new Paragraph({children:[await picture(Buffer.from(block.image.split(',')[1],'base64'))],
      alignment:AlignmentType.CENTER,spacing:{before:60,after:120}}));}
  } else if(block.kind==='callout') {
    result.push(new Table({width:{size:mm(170),type:WidthType.DXA},columnWidths:[mm(170)],borders:noneBorders,
      rows:[new TableRow({children:[cell('',block.text,project)]})]}));
    result.push(paragraph('',{spacing:{line:80,after:0,before:0}}));
  } else result.push(paragraph(block.text,{alignment:block.kind==='paragraph'?AlignmentType.JUSTIFIED:AlignmentType.LEFT,
    ...(block.kind==='list'?{indent:{left:mm(5)},border:{left:{style:BorderStyle.SINGLE,size:5,color:'E0E7EF',space:7}}}:{})}));
  if(block.caption)result.push(paragraph(block.caption,{children:runs(block.caption,{size:18,color:'607087'}),spacing:{before:40,after:130,line:260}}));
  return result;
}
