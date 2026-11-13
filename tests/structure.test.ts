import test from 'node:test';
import assert from 'node:assert/strict';
import { blockSchema, sourceSchema, type SourceDocument } from '../shared/document';
import { inferDocumentMetadata, isPaginationArtifact, normalizeSource } from '../shared/structure';
import { pdfTextLines } from '../server/import/pdf-text';
import { pdfSemanticEntries } from '../server/import/pdf-tables';
import { cleanPdfFurniture } from '../server/import/pdf-furniture';
function source(texts:string[],extra:Partial<SourceDocument>={}):SourceDocument{
  return sourceSchema.parse({name:'CAPÍTULO I.docx',format:'docx',sha256:'a'.repeat(64),pageCount:0,ocr:false,warnings:[],
    blocks:texts.map((text,i)=>blockSchema.parse({id:`s-${i+1}`,kind:'paragraph',sourceIds:[`s-${i+1}`],text})),...extra});
}
test('document title uses actual metadata or subject instead of the first chapter label',()=>{
  assert.equal(inferDocumentMetadata(source(['CAPÍTULO I','DO OBJETO'],{metadata:{title:'Regulamento de Cursos e Trilhas',subject:'Participação institucional'}})).title,'Regulamento de Cursos e Trilhas');
  const value=inferDocumentMetadata(source(['Regulamenta a seleção e participação de instituições.','CAPÍTULO I','DO OBJETO'],{metadata:{title:'CAPÍTULO I'}}));
  assert.equal(value.title,'Regulamenta a seleção e participação de instituições');
  assert.notEqual(inferDocumentMetadata(source(['CAPÍTULO I','DO OBJETO'])).title,'CAPÍTULO I');
});
test('normalization removes unambiguous pagination furniture and unifies chapter and clause titles',()=>{
  const value=normalizeSource(source(['CAPÍTULO I','DO OBJETO','Art. 1º A oferta tem condições.','Página 1 de 8','CLÁUSULA PRIMEIRA','DO OBJETO','1.1. O acordo é gratuito.']));
  assert.equal(value.blocks[0].kind,'heading');assert.equal(value.blocks[0].text,'CAPÍTULO I\nDO OBJETO');
  assert.equal(value.blocks[2].kind,'heading');assert.equal(value.blocks[2].level,2);
  assert.equal(value.blocks.some(block=>block.text==='Página 1 de 8'),false);
  assert.equal(value.sha256,'a'.repeat(64));assert.match(value.warnings.join(' '),/paginação/);
  for(const text of ['Art. 1º Página 1 de 8 é apenas um exemplo.','§ 1º O prazo é de 8 dias.','1','8 de 1'])assert.equal(isPaginationArtifact(text),false);
});
test('explicit fragmented fields and bracketed values recover a real editable table without invented cells',()=>{
  const value=normalizeSource(source(['QUADRO DAS OFERTAS','CAMPO CONDIÇÃO ACORDADA','Escopo autorizado [CURSOS E','TRILHAS]','Fonte oficial [ENDEREÇO ELETRÔNICO]','1.2. O quadro delimita o objeto.']));
  const table=value.blocks.find(block=>block.kind==='table');assert.deepEqual(table?.rows,[['CAMPO','CONDIÇÃO ACORDADA'],['Escopo autorizado','[CURSOS E TRILHAS]'],['Fonte oficial','[ENDEREÇO ELETRÔNICO]']]);
  assert.equal(value.blocks.at(-1)?.text,'1.2. O quadro delimita o objeto.');
  assert.equal(normalizeSource(source(['CAMPO CONDIÇÃO ACORDADA','Texto sem evidência de células.'])).blocks.some(block=>block.kind==='table'),false);
});
const item=(str:string,x:number,y:number,width:number)=>({str,transform:[12,0,0,12,x,y],width,height:12,hasEOL:false,fontName:'Helvetica',dir:'ltr'});
test('PDF spatial table reconstruction retains aligned cell text and multiline continuations',()=>{
  const lines=pdfTextLines({items:[item('CAMPO',60,700,40),item('CONDIÇÃO',220,700,80),item('Escopo',60,680,50),item('Cursos gratuitos',220,680,100),item('e trilhas completas',220,665,110),item('Fonte',60,640,40),item('Catálogo oficial',220,640,100),item('Art. 1º Texto fora da tabela.',60,600,200)],styles:{},lang:'pt-BR'} as any);
  const value=pdfSemanticEntries(lines);assert.equal(value.tables,1);
  assert.deepEqual(value.entries[0].rows,[['CAMPO','CONDIÇÃO'],['Escopo','Cursos gratuitos\ne trilhas completas'],['Fonte','Catálogo oficial']]);
  assert.match(value.entries[1].text,/Art\. 1º/);
});
test('PDF recurrent running headers are removed only in page margins while identical body text survives',()=>{
  const frames=[1,2,3].map(page=>({page,width:595,height:842,hasGraphics:false,images:[],lines:pdfTextLines({items:[item('Programa Institucional',60,810,180),item('Programa Institucional',60,700,180),item(String(page),60,30,10)],styles:{},lang:'pt-BR'} as any)}));
  const warnings:string[]=[];const cleaned=cleanPdfFurniture(frames,warnings);
  assert.ok(cleaned.every(frame=>frame.lines.length===1&&frame.lines[0].y===700));assert.match(warnings.join(' '),/cabeçalho/);
});
test('cached table of contents entries are not mistaken for chapter captions or body content',()=>{
  const value=normalizeSource(source(['Sumário','CAPÍTULO I','CAPÍTULO II','ANEXO I','CONSELHO REGIONAL DE ADMINISTRAÇÃO DE SÃO PAULO','CAPÍTULO I','DO OBJETO','Art. 1º Regra.'],{blocks:[
    blockSchema.parse({id:'toc',kind:'heading',text:'Sumário',sourceIds:['toc']}),
    ...['CAPÍTULO I','CAPÍTULO II','ANEXO I','CONSELHO REGIONAL DE ADMINISTRAÇÃO DE SÃO PAULO','CAPÍTULO I','DO OBJETO','Art. 1º Regra.'].map((text,i)=>blockSchema.parse({id:`x${i}`,kind:'paragraph',text,sourceIds:[`x${i}`]}))]}));
  assert.equal(value.blocks.some(block=>block.text==='CAPÍTULO I\nCAPÍTULO II'),false);
  assert.equal(value.blocks.some(block=>block.text==='ANEXO I\nCONSELHO REGIONAL DE ADMINISTRAÇÃO DE SÃO PAULO'),false);
  assert.equal(value.blocks.some(block=>block.text==='CAPÍTULO I\nDO OBJETO'),true);
  assert.match(value.warnings.join(' '),/sumário automático/);
});
test('a short cover title precedes generic presentation headings when PDF metadata is absent',()=>{
  assert.equal(inferDocumentMetadata(source(['Programa de Desenvolvimento Profissional','Apresentação'],{name:'Versão Editada Final.pdf',format:'pdf'})).title,'Programa de Desenvolvimento Profissional');
});
test('normative citation and authority are never substituted for the document title',()=>{
  const data=source(['CONSELHO REGIONAL DE ADMINISTRAÇÃO DE SÃO PAULO','RESOLUÇÃO NORMATIVA CRA-SP Nº [NÚMERO], DE [DIA] DE [MÊS] DE [ANO]','Regulamenta as condições das ofertas gratuitas.','CAPÍTULO I','DO OBJETO'],{metadata:{title:'CAPÍTULO I'}});
  assert.equal(inferDocumentMetadata(data).title,'Regulamenta as condições das ofertas gratuitas');
});
test('PDF line wrapping does not add spaces inside hyphenated names or compound terms',async()=>{
  const {paragraphsFromPdf}=await import('../server/import/pdf-text');
  const result=paragraphsFromPdf({items:[item('Conselho CRA-',60,700,100),item('SP mantém a oferta.',60,684,150)],styles:{},lang:'pt-BR'} as any);
  assert.equal(result[0].text,'Conselho CRA-SP mantém a oferta.');
});
