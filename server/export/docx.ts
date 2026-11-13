import { AlignmentType, BorderStyle, Document, Footer, FrameAnchorType, FrameWrap, Header, LineRuleType, PageNumber, Paragraph, SectionType,
  ShadingType, Table, TableCell, TableLayoutType, TableOfContents, TableRow, TextRun, WidthType,
  type ISectionOptions } from 'docx';
import { validateImage } from '../images';
import type { DocumentProject } from '../../shared/document';
import type { CompositionPage, CompositionFragment, DocumentComposition } from '../../src/document/composition';
import { readDocumentComposition } from './browser';
import { FONT, background, coverLogo, coverTextMetrics, embeddedFonts, footerPoint, hex, logo, mm, picture, referenceCover } from './docx-assets';
import { anchor, blockContents, paragraph, runs, type WordContent } from './docx-components';

const NONE={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
const borders={top:NONE,bottom:NONE,left:NONE,right:NONE,insideH:NONE,insideV:NONE};

function assertXmlText(project:DocumentProject) {
  const strings=[project.title,project.subtitle,project.author,project.theme.organization,
    ...project.blocks.flatMap(block=>[block.text,block.caption,...block.rows.flat(),
      ...block.items.flatMap(item=>[item.title,item.text]),...(block.nodes||[]).flatMap(node=>[node.label,node.detail]),
      ...(block.edges||[]).map(edge=>edge.label)])];
  if(strings.some(text=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text)))
    throw new Error('O texto contém caracteres incompatíveis com o Word. Revise os caracteres de controle.');
}
async function header(project:DocumentProject,cover=false) {
  const backdrop=new Paragraph({children:[await background(project,cover)],spacing:{before:0,after:0,line:1}});
  if(cover)return new Header({children:[backdrop]});
  const mark=await logo(project);
  const cells=[new TableCell({width:{size:mm(128),type:WidthType.DXA},borders,
    margins:{top:0,bottom:0,left:0,right:100},children:[paragraph(project.title.toLocaleUpperCase('pt-BR'),
      {children:runs(project.title.toLocaleUpperCase('pt-BR'),{size:13,color:'69778C'}),
        spacing:{before:80,after:0,line:180}})]}),
  new TableCell({width:{size:mm(23),type:WidthType.DXA},borders,margins:{top:0,bottom:0,left:0,right:120},
    children:[paragraph('',{border:{bottom:{style:BorderStyle.DOTTED,size:4,color:'BFCBDD'}},
      spacing:{before:110,after:0,line:80}})]}),
  new TableCell({width:{size:mm(19),type:WidthType.DXA},borders,margins:{top:0,bottom:0,left:0,right:0},
    children:[new Paragraph({children:mark?[await picture(mark,62,45)]:runs(project.theme.organization,
      {size:15,bold:true,color:hex(project.theme.primary)}),alignment:AlignmentType.RIGHT,
      spacing:{before:0,after:0,line:700,lineRule:LineRuleType.EXACT}})]})];
  return new Header({children:[backdrop,new Table({width:{size:mm(170),type:WidthType.DXA},
    columnWidths:[mm(128),mm(23),mm(19)],layout:TableLayoutType.FIXED,borders,rows:[new TableRow({children:cells})]})]});
}
async function footer(project:DocumentProject) {
  const point=await footerPoint(project);
  const label=project.theme.organization.trim().toUpperCase()==='CRA-SP'?
    'Rua Estados Unidos, 889 · Jardim América · São Paulo/SP\nwww.crasp.gov.br · (11) 3087-3200':project.theme.organization;
  return new Footer({children:[new Table({width:{size:mm(190),type:WidthType.DXA},
    indent:{size:-mm(20),type:WidthType.DXA},columnWidths:[mm(15),mm(4),mm(171)],borders,
    rows:[new TableRow({children:[
      new TableCell({width:{size:mm(15),type:WidthType.DXA},borders,
        shading:{type:ShadingType.CLEAR,fill:hex(project.theme.primary)},margins:{top:20,bottom:20,left:170,right:0},
        children:[new Paragraph({children:[new TextRun({children:[PageNumber.CURRENT],font:FONT,bold:true,size:16,color:'FFFFFF'})],
          spacing:{before:0,after:0,line:320,lineRule:LineRuleType.EXACT}})]}),
      new TableCell({width:{size:mm(4),type:WidthType.DXA},borders,margins:{top:0,bottom:0,left:0,right:0},
        children:[new Paragraph({children:[point],spacing:{before:0,after:0,line:320,lineRule:LineRuleType.EXACT}})]}),
      new TableCell({width:{size:mm(171),type:WidthType.DXA},borders,margins:{top:0,bottom:0,left:0,right:0},
        children:[paragraph(label,{alignment:AlignmentType.RIGHT,
          children:runs(label,{size:13,color:'748094'}),spacing:{before:45,after:0,line:160}})]}),
    ]})]})]});
}
async function cover(project:DocumentProject):Promise<WordContent[]> {
  if(referenceCover(project)){
    const metrics=await coverTextMetrics(project);
    const frame={type:'absolute' as const,position:{x:mm(20),y:mm(metrics.top)},width:mm(170),
      anchor:{horizontal:FrameAnchorType.PAGE,vertical:FrameAnchorType.PAGE},wrap:FrameWrap.NONE};
    const result:WordContent[]=[paragraph(project.title,{children:runs(project.title,{size:metrics.size*2,bold:true,color:'FFFFFF'}),
      alignment:AlignmentType.CENTER,spacing:{before:mm(metrics.top-48),after:mm(5),line:Math.round(metrics.size*1.12*20)}})];
    if(project.subtitle)result.push(paragraph(project.subtitle,{children:runs(project.subtitle,{size:24,color:'FFFFFF'}),
      alignment:AlignmentType.CENTER,spacing:{before:0,after:0,line:336}}));
    if(project.author)result.push(paragraph(project.author,{children:runs(project.author,{size:16,color:'FFFFFF'}),
      frame:{...frame,position:{x:mm(20),y:mm(285)}},alignment:AlignmentType.CENTER,spacing:{before:0,after:0,line:200}}));
    return result;
  }
  const mark=await coverLogo(project);
  const result:WordContent[]=[];
  if(mark)result.push(new Paragraph({children:[mark],alignment:AlignmentType.RIGHT,spacing:{after:0,before:0,line:1700,lineRule:LineRuleType.EXACT}}));
  result.push(paragraph(project.theme.organization,{children:runs(project.theme.organization,
    {size:24,bold:true,color:'FFFFFF'}),spacing:{before:mm(12),after:0,line:320}}));
  const long=project.title.length>150;
  const titleSize=long?48:64;
  result.push(paragraph(project.title,{children:runs(project.title,{size:titleSize,bold:true,color:'FFFFFF'}),
    spacing:{before:mm(long?37:53),after:mm(8),line:long?590:760},
    border:{left:{style:BorderStyle.SINGLE,size:24,color:hex(project.theme.accent),space:16}},keepNext:!!project.subtitle}));
  if(project.subtitle)result.push(paragraph(project.subtitle,{children:runs(project.subtitle,
    {size:project.subtitle.length>500?23:28,color:'E9EFF7'}),spacing:{after:mm(7),before:0,line:370}}));
  if(project.author)result.push(paragraph(project.author,{children:runs(project.author,{size:21,color:'E9EFF7'}),
    spacing:{before:mm(8),after:0,line:290}}));
  return result;
}
function contents(composition:DocumentComposition,tocPages?:Record<string,number>) {
  const entries=composition.toc.filter(item=>item.level<=3).map(item=>({title:item.text,level:Math.min(3,item.level),page:tocPages?.[item.blockId]??item.page,href:anchor(item.blockId)}));
  return [paragraph('Sumário',{style:'Title',spacing:{before:0,after:440,line:620}}),
    new TableOfContents('Sumário',{hyperlink:true,headingStyleRange:'1-3',cachedEntries:entries,beginDirty:true})];
}
async function pageContents(page:CompositionPage,project:DocumentProject) {
  const result:WordContent[]=[];
  const byId=new Map(project.blocks.map(block=>[block.id,block]));
  for(const fragment of page.fragments) {
    const source=byId.get(fragment.blockId);
    if(!source)continue;
    const merged={...source,kind:fragment.kind,text:fragment.text,rows:fragment.rows,items:fragment.items,
      nodes:fragment.nodes,edges:fragment.edges,level:fragment.level,layout:fragment.layout,caption:fragment.caption||'',breakBefore:false,
      image:fragment.kind==='image'?fragment.image||source.image:''};
    if(fragment.role==='component-title'){
      const index=project.blocks.filter(block=>block.kind==='diagram').findIndex(block=>block.id===source.id);
      result.push(paragraph(`INFOGRÁFICO ${index+1}`,{children:runs(`INFOGRÁFICO ${index+1}`,{size:15,bold:true,color:hex(project.theme.primary)}),
        keepNext:true,spacing:{before:100,after:60,line:200},border:{left:{style:BorderStyle.SINGLE,size:13,color:hex(project.theme.accent),space:6}}}));
      result.push(paragraph(fragment.text,{children:runs(fragment.text,{size:40,bold:true,color:hex(project.theme.primary)}),
        keepNext:true,spacing:{before:0,after:190,line:480}}));
      continue;
    }
    result.push(...await blockContents(merged,project,fragment.continued));
  }
  return result;
}
function sectionProperties(coverPage:boolean,project:DocumentProject) {
  return {type:SectionType.NEXT_PAGE,page:{size:{width:mm(210),height:mm(297)},
    margin:{top:mm(coverPage?(referenceCover(project)?48:26):31),right:mm(coverPage?(referenceCover(project)?20:22):20),bottom:mm(24),left:mm(coverPage?(referenceCover(project)?20:22):20),
      header:mm(12),footer:mm(12)}}};
}

export async function exportDocx(project:DocumentProject,tocPages?:Record<string,number>):Promise<Buffer> {
  assertXmlText(project);
  for(const block of project.blocks.filter(item=>item.kind==='diagram')){
    const ids=new Set((block.nodes||[]).map(node=>node.id));
    if(!ids.size||ids.size!==(block.nodes||[]).length||(block.edges||[]).some(edge=>!ids.has(edge.from)||!ids.has(edge.to)))
      throw new Error('O infográfico contém etapas ou conexões inválidas.');
  }
  for(const image of new Set([project.theme.logo,...project.blocks.map(block=>block.image)].filter(Boolean)))validateImage(image);
  const composition=await readDocumentComposition(project);
  const [bodyHeader,coverHeader,bodyFooter,fonts]=await Promise.all([
    header(project),header(project,true),footer(project),embeddedFonts()]);
  const sections:ISectionOptions[]=[];let tocWritten=false;
  for(const page of composition.pages) {
    if(page.kind==='toc'&&tocWritten)continue;
    const isCover=page.kind==='cover';
    const children=isCover?await cover(project):page.kind==='toc'?contents(composition,tocPages):await pageContents(page,project);
    if(page.kind==='toc')tocWritten=true;
    sections.push({properties:sectionProperties(isCover,project),headers:{default:isCover?coverHeader:bodyHeader},
      footers:{default:isCover?new Footer({children:[paragraph('')]}):bodyFooter},children});
  }
  const primary=hex(project.theme.primary),accent=hex(project.theme.accent);
  const document=new Document({title:project.title,subject:project.subtitle,creator:project.author||project.theme.organization,
    description:'Documento institucional editável produzido no Diagrama.ai.',features:{updateFields:true},fonts,
    theme:{colors:{accent1:primary,accent2:accent,dark1:'293444'},fonts:{headings:FONT,body:FONT}},
    styles:{default:{document:{run:{font:FONT,size:project.theme.fontSize*2,color:'293444'},
      paragraph:{spacing:{before:0,after:198,line:348,lineRule:LineRuleType.EXACT}}}},paragraphStyles:[
      {id:'Title',name:'Title',basedOn:'Normal',run:{font:FONT,bold:true,size:48,color:primary}},
      ...[1,2,3,4,5,6].map(level=>({id:`Heading${level}`,name:`heading ${level}`,basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{font:FONT,bold:true,size:level===1?44:level===2?28:24,color:level===2?accent:primary},
        paragraph:{keepNext:true,keepLines:true,outlineLevel:level-1,spacing:{before:level===1?0:120,after:160,line:level===1?520:340,lineRule:LineRuleType.EXACT}}})),
      ...[1,2,3].map(level=>({id:`TOC${level}`,name:`TOC ${level}`,basedOn:'Normal',run:{font:FONT,size:level===1?21:20,color:primary},
        paragraph:{indent:{left:level===1?0:mm(4)},spacing:{before:0,after:95,line:280,lineRule:LineRuleType.EXACT}}})),
    ]},sections});
  return PackerBuffer(document);
}
async function PackerBuffer(document:Document):Promise<Buffer> {
  const {Packer}=await import('docx');return Packer.toBuffer(document);
}
