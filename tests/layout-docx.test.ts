import assert from 'node:assert/strict';
import test from 'node:test';
import { fromBuffer, type Entry } from 'yauzl';
import { createCanvas } from '@napi-rs/canvas';
import { createProject, makeBlock } from '../shared/document';
import { exportDocx } from '../server/export/docx';

async function unzip(buffer: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error || !zip) return reject(error);
    const entries = new Map<string, string>();
    zip.on('error', reject);
    zip.on('end', () => resolve(entries));
    zip.on('entry', (entry: Entry) => zip.openReadStream(entry, (readError, stream) => {
      if (readError || !stream) return reject(readError);
      const parts: Buffer[] = [];
      stream.on('error', reject);
      stream.on('data', part => parts.push(part));
      stream.on('end', () => {
        entries.set(entry.fileName, Buffer.concat(parts).toString('utf8'));
        zip.readEntry();
      });
    }));
    zip.readEntry();
  }));
}

test('editable Word contains heading, all content types, TOC and native page fields', async () => {
  const project = createProject();
  project.title = 'Programa de Desenvolvimento Profissional';
  project.subtitle = 'Documento de verificação da exportação editável';
  project.author = 'CRA-SP';
  const heading = makeBlock('heading', 'CAPÍTULO I — DAS DISPOSIÇÕES PRELIMINARES');
  const paragraph = makeBlock('paragraph', 'Art. 1º Texto preservado: Administração, graduação e distinção.\nSegunda linha.');
  const table = makeBlock('table');
  table.rows = [['Coluna de origem', 'Condição'], ['Cursos livres', 'Gratuidade integral'], ['Trilhas', 'Unidades formativas']];
  const cards = makeBlock('cards', 'Premissas do Programa');
  cards.items = [{ title: 'Conectores', text: 'Instituições participantes e profissionais.' },
    { title: 'Acesso', text: 'Condições objetivas e igualdade de participação.' }];
  const steps = makeBlock('steps', 'Fluxo de aprovação');
  steps.items = [{ title: 'Análise técnica', text: 'Verificação dos requisitos.' },
    { title: 'Deliberação', text: 'Decisão fundamentada.' }];
  const image = makeBlock('image', 'Figura de validação');
  const canvas = createCanvas(40, 20);
  canvas.getContext('2d').fillRect(0, 0, 40, 20);
  image.image = canvas.toDataURL('image/png');
  image.caption = 'Legenda editável da figura.';
  project.blocks = [heading, paragraph, makeBlock('list', 'I — Capacitação e aperfeiçoamento.'),
    makeBlock('callout', 'Requisito obrigatório.'), table, cards, steps, image];
  const files = await unzip(await exportDocx(project));
  const xml = files.get('word/document.xml')!;
  for (const text of [project.title, project.subtitle, project.author,
    ...project.blocks.flatMap(block => [block.text, block.caption, ...block.rows.flat(),
      ...block.items.flatMap(item => [item.title, item.text])])].filter(Boolean)) {
    for (const line of text.split('\n')) assert.ok(xml.includes(line), `Text missing: ${line}`);
  }
  assert.ok(xml.includes('TOC'));
  assert.equal((xml.match(/<w:instrText[^>]*>TOC /g)||[]).length,1,'A single native TOC field must span all TOC pages.');
  assert.ok(xml.includes('w:tblHeader'));
  assert.ok(xml.includes('w:pStyle w:val="Heading1"'));
  assert.ok(xml.includes('w:drawing'));
  assert.ok([...files.keys()].filter(name => name.startsWith('word/media/') && !name.endsWith('/')).length >= 5, 'Branding assets and the source figure must remain separate images.');
  const headers=[...files.entries()].filter(([name])=>/^word\/header\d+\.xml$/.test(name)).map(([,value])=>value).join('');
  assert.ok(headers.includes('wp:anchor'),'Branding backgrounds use decorative anchored images.');
  assert.ok(headers.includes('w:drawing'),'The official logo is automatic in the header.');
  assert.ok([...files.entries()].filter(([name])=>/^word\/footer\d+\.xml$/.test(name)).some(([,value])=>value.includes('PAGE')));
  assert.ok(files.get('word/styles.xml')?.includes('Libre Franklin'));
  assert.ok(files.get('word/fontTable.xml')?.includes('w:embedRegular'));
  assert.ok(files.get('word/fontTable.xml')?.includes('w:embedBold'));
  assert.equal([...files.keys()].filter(name => /^word\/fonts\/.+\.odttf$/.test(name)).length, 2);
  assert.ok(files.get('word/settings.xml')?.includes('w:embedTrueTypeFonts'));
});

test('Word does not silently remove invalid control characters or accept external image links', async () => {
  const project = createProject();
  project.blocks = [makeBlock('paragraph', 'Trecho inválido\u0000')];
  await assert.rejects(exportDocx(project), /caracteres incompatíveis/);
  project.blocks = [makeBlock('image')];
  project.blocks[0].image = 'https://example.com/tracking.png';
  await assert.rejects(exportDocx(project), /imagem|PNG|JPEG|WebP/i);
});

test('long content remains native text and table rows can flow across pages', async () => {
  const project = createProject();
  project.cover = false;
  project.toc = false;
  const table = makeBlock('table');
  table.rows = [['Descrição', 'Valor'], ...Array.from({ length: 90 }, (_, i) => [`Linha ${i + 1}`, `Conteúdo ${i + 1}`])];
  project.blocks = [makeBlock('paragraph', 'Texto extenso preservado. '.repeat(3000)), table];
  const xml = (await unzip(await exportDocx(project))).get('word/document.xml')!;
  assert.equal(xml.split('Texto extenso preservado.').length - 1, 3000);
  assert.ok(xml.includes('Linha 90'));
  assert.equal(xml.includes('w:cantSplit'), false);
  assert.equal(xml.includes('w:drawing'), false, 'Text and source tables remain native; page branding is isolated in headers.');
});


test('native Word contains graph branches and relationship labels instead of flattening the infographic', async()=>{
  const project=createProject();project.title='Fluxo de cooperação';project.toc=false;
  const graph=makeBlock('diagram','Análise e decisão');graph.layout='decision';
  graph.nodes=[{id:'proposal',label:'Proposta',detail:'Documentação da instituição.',sourceIds:[]},
    {id:'accept',label:'Aprovação',detail:'Requisitos atendidos.',sourceIds:[]},
    {id:'pending',label:'Complementação',detail:'Documentação pendente.',sourceIds:[]}];
  graph.edges=[{from:'proposal',to:'accept',label:'Atende'},{from:'proposal',to:'pending',label:'Pendência'}];
  project.blocks=[graph];const files=await unzip(await exportDocx(project));const document=files.get('word/document.xml')!;
  for(const node of graph.nodes){assert.ok(document.includes(node.label));assert.ok(document.includes(node.detail));}
  for(const edge of graph.edges)assert.ok(document.includes(edge.label));
  assert.ok(document.includes('w:tbl'),'Graph nodes are editable table cells.');
  assert.ok(document.includes('INFOGRÁFICO 1'));
});

test('Word proof reports unavailable tools honestly and supports cancellation', async()=>{
  const {wordRendererStatus,proofWord}=await import('../server/export/word-proof');
  const previous=process.env.LIBREOFFICE_PATH;process.env.LIBREOFFICE_PATH='/nonexistent/diagrama-office';
  try{assert.equal(await wordRendererStatus(),false);const proof=await proofWord(createProject());
    assert.equal(proof.available,false);assert.equal(proof.completed,false);assert.ok(proof.issues.length);}
  finally{if(previous===undefined)delete process.env.LIBREOFFICE_PATH;else process.env.LIBREOFFICE_PATH=previous;}
  const controller=new AbortController();controller.abort();await assert.rejects(proofWord(createProject(),controller.signal),/cancelada/);
});

test('real Word rendering preserves text and produces inspected page images',async context=>{
  const {wordRendererStatus,proofWord}=await import('../server/export/word-proof');
  if(!await wordRendererStatus()){context.skip('LibreOffice and Poppler are not installed.');return;}
  const project=createProject();project.title='Cooperação institucional';
  project.blocks=[makeBlock('heading','Requisitos de participação'),makeBlock('paragraph','A formação será integralmente gratuita.')];
  const proof=await proofWord(project);assert.equal(proof.available,true);assert.equal(proof.completed,true);
  assert.ok(proof.pages&&proof.pages>=3);assert.equal(proof.images?.length,proof.pages);
  assert.deepEqual(proof.issues.filter(issue=>issue.severity==='error'),[]);
  assert.equal(proof.tocPages?.[project.blocks[0].id],3);
  assert.ok(proof.document,'The exact native document used by the successful proof is returned.');
  const proven=await unzip(proof.document!);assert.equal((proven.get('word/document.xml')!.match(/<w:instrText[^>]*>TOC /g)||[]).length,1);
});


test('invalid graph references cannot silently disappear from the native Word export',async()=>{
  const project=createProject();const graph=makeBlock('diagram','Processo');graph.nodes=[{id:'a',label:'Etapa',detail:'',sourceIds:[]}];
  graph.edges=[{from:'a',to:'missing',label:'Condição'}];project.blocks=[graph];
  await assert.rejects(exportDocx(project),/conexões inválidas/);
});
