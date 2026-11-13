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
  assert.ok(xml.includes('w:tblHeader'));
  assert.ok(xml.includes('w:pStyle w:val="Heading1"'));
  assert.ok(xml.includes('w:drawing'));
  assert.equal([...files.keys()].filter(name => name.startsWith('word/media/') && !name.endsWith('/')).length, 1);
  assert.ok(files.get('word/footer1.xml')?.includes('PAGE'));
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
  await assert.rejects(exportDocx(project), /imagem deve ser/);
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
  assert.equal(xml.includes('w:drawing'), false);
});
