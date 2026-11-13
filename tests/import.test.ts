import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, ImageRun } from 'docx';
import { importDocument, ImportError } from '../server/import/index';
import { blocksFromHtml } from '../server/import/html';
import { validateDocxArchive } from '../server/import/archive';
import { importPdf } from '../server/import/pdf';

function pdfFixture(withImage = false): Buffer {
  const stream=withImage ? 'q 300 0 0 300 60 400 cm /Im1 Do Q' : 'BT /F1 12 Tf 60 740 Td (Primeiro paragrafo.) Tj 0 -40 Td (Segundo paragrafo.) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> ${withImage ? '/XObject << /Im1 6 0 R >>' : ''} >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  if (withImage) objects.push('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nff0000>\nendstream');
  let body='%PDF-1.4\n'; const offsets=[0];
  for (let i=0;i<objects.length;i++) {
    offsets.push(Buffer.byteLength(body)); body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=Buffer.byteLength(body);
  body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  body+=offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  body+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

test('HTML extraction preserves ordered paragraphs, nested lists, tables and inline image placement',()=>{
  const blocks=blocksFromHtml('<h1>Capítulo I</h1><p>Texto <strong>fiel</strong>, sem alterações.<br>Segunda linha.</p>'
    +'<ol><li>Primeiro<ul><li>Subitem</li></ul></li><li>Segundo</li></ol>'
    +'<table><tr><th>Campo</th><th>Valor</th></tr><tr><td><p>Prazo</p></td><td>10 dias</td></tr></table>'
    +'<p>Antes<img src="data:image/png;base64,aGVsbG8=">Depois</p>');
  assert.deepEqual(blocks.map(block=>block.kind),['heading','paragraph','list','list','list','table','paragraph','image','paragraph']);
  assert.equal(blocks[1].text,'Texto fiel, sem alterações.\nSegunda linha.');
  assert.equal(blocks[3].level,2);
  assert.deepEqual(blocks[5].rows,[['Campo','Valor'],['Prazo','10 dias']]);
  assert.equal(blocks[6].text,'Antes'); assert.equal(blocks[8].text,'Depois');
  assert.ok(blocks.every(block=>block.sourceIds[0]===block.id));
});

test('HTML source is text, external URLs and executable elements are not accepted as images',()=>{
  const blocks=blocksFromHtml('<p>&lt;script&gt;texto&lt;/script&gt;</p><script>execute()</script><img src="https://example.com/img.png">');
  assert.equal(blocks.length,1); assert.equal(blocks[0].text,'<script>texto</script>');
});

test('DOCX import uses a real native document and preserves headings, tables, accents and images',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=','base64');
  const doc=new Document({title:'Regulamento de cursos gratuitos',subject:'Condições de participação',creator:'CRA-SP',sections:[{children:[
    new Paragraph({text:'CAPÍTULO I — DO PROGRAMA',heading:HeadingLevel.HEADING_1}),
    new Paragraph({children:[new TextRun({text:'Art. 1º ',bold:true}),new TextRun('Texto integral, com ação e critérios.')] }),
    new Table({rows:[new TableRow({children:[new TableCell({children:[new Paragraph('Requisito')]}),new TableCell({children:[new Paragraph('Descrição')]})]}),
      new TableRow({children:[new TableCell({children:[new Paragraph('Gratuidade')]}),new TableCell({children:[new Paragraph('Integral, sem cobrança.')]})]})]}),
    new Paragraph({children:[new ImageRun({type:'png',data:png,transformation:{width:20,height:20}})]}),
  ]}]});
  const buffer=await Packer.toBuffer(doc);
  const result=await importDocument(buffer,'Regulamento.docx');
  assert.equal(result.format,'docx'); assert.equal(result.ocr,false); assert.equal(result.sha256.length,64);
  assert.equal(result.metadata?.title,'Regulamento de cursos gratuitos');
  assert.equal(result.metadata?.subject,'Condições de participação');
  assert.equal(result.metadata?.author,'CRA-SP');
  assert.equal(result.blocks[0].kind,'heading');
  assert.equal(result.blocks[1].text,'Art. 1º Texto integral, com ação e critérios.');
  assert.deepEqual(result.blocks.find(block=>block.kind==='table')?.rows,[['Requisito','Descrição'],['Gratuidade','Integral, sem cobrança.']]);
  assert.ok(result.blocks.find(block=>block.kind==='image')?.image.startsWith('data:image/png;base64,'));
});

test('PDF text extraction reads a real PDF page without silently substituting OCR or invented text',async()=>{
  const result=await importDocument(pdfFixture(),'documento.pdf');
  assert.equal(result.format,'pdf'); assert.equal(result.pageCount,1); assert.equal(result.ocr,false);
  assert.equal(result.blocks.map(block=>block.text).join('\n'),'Primeiro paragrafo.\nSegundo paragrafo.');
  assert.ok(result.blocks.every(block=>block.sourcePage===1));
});

test('import rejects empty, unsupported, mislabeled, oversized and non-Word ZIP archives',async()=>{
  await assert.rejects(importDocument(Buffer.alloc(0),'vazio.pdf'),ImportError);
  await assert.rejects(importDocument(Buffer.from('not a PDF'),'arquivo.pdf'),/PDF válido/);
  await assert.rejects(importDocument(Buffer.from('not a DOCX'),'arquivo.docx'),/DOCX válido/);
  await assert.rejects(importDocument(Buffer.from('text'),'arquivo.doc'),/Formato não aceito/);
  await assert.rejects(importDocument(Buffer.alloc(20*1024*1024+1),'grande.docx'),/20 MB/);
  await assert.rejects(validateDocxArchive(Buffer.from('not a zip')),/corrompido/);
});

test('an image-only PDF retains its image and requires actual OCR rather than returning an empty source', async()=>{
  const result=await importPdf(pdfFixture(true));
  assert.equal(result.requiresOcr,true);
  assert.equal(result.blocks.length,1);
  assert.equal(result.blocks[0].kind,'image');
  assert.ok(result.blocks[0].image.startsWith('data:image/png;base64,'));
});

test('image import normalizes real GIF to PNG and rejects oversized dimensions before decoding',async()=>{
  const {importImage}=await import('../server/import/images');
  const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
  const warnings:string[]=[];
  const data=await importImage(gif,warnings);
  assert.ok(data.startsWith('data:image/png;base64,'));
  assert.equal(warnings.length,1);assert.match(warnings[0],/primeiro quadro/);
  const {createCanvas}=await import('@napi-rs/canvas');
  const bomb=createCanvas(1,1).toBuffer('image/png');
  bomb.writeUInt32BE(100000,16);bomb.writeUInt32BE(100000,20);
  await assert.rejects(importImage(bomb,[]),/40 milhões de pixels/);
});

test('native PNG, JPEG and WebP dimensions pass bounded import using their actual signatures',async()=>{
  const {importImage}=await import('../server/import/images');
  const {createCanvas}=await import('@napi-rs/canvas');
  const canvas=createCanvas(7,5);canvas.getContext('2d').fillRect(0,0,7,5);
  for(const format of ['png','jpeg','webp'] as const){
    const bytes=format==='png'?canvas.toBuffer('image/png'):format==='jpeg'?canvas.toBuffer('image/jpeg'):canvas.toBuffer('image/webp');
    assert.ok((await importImage(bytes,[])).startsWith(`data:image/${format};base64,`));
  }
});

test('DOCX archive validation checks actual decompression against declared ZIP sizes',async()=>{
  const buffer=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Conteúdo real para validar a estrutura compactada.')] }]}));
  await validateDocxArchive(buffer);
  const forged=Buffer.from(buffer);
  let offset=forged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  let changed=false;
  while(offset>=0 && offset+46<forged.length){
    if(forged.readUInt32LE(offset+24)>1){forged.writeUInt32LE(1,offset+24);changed=true;break;}
    offset=forged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),offset+4);
  }
  assert.equal(changed,true);
  await assert.rejects(validateDocxArchive(forged),/compactad[ao]|estrutura|descompactado/);
});


test('cancelled imports stop before file parsing or any OCR provider request',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>importDocument(Buffer.from('cancelled'),'arquivo.pdf',controller.signal),{name:'AbortError'});
});
