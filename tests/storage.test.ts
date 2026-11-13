import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, makeBlock } from '../shared/document';
import { ProjectSession } from '../src/services/projectSession';
import { StorageError, workParentOrigin, type SaveRequest, type SavedMetadata } from '../src/services/storage';

function saved(request: SaveRequest): SavedMetadata {
  return { id: request.id, title: request.document.title, author: request.document.author,
    blockCount: request.document.blocks.length, revision: request.revision + 1,
    createdAt: request.document.createdAt, updatedAt: request.document.updatedAt };
}

test('session tracks only acknowledged content and retains edits made while saving', async () => {
  let release: (value: SavedMetadata) => void = () => {};
  let captured: SaveRequest;
  const session = new ProjectSession(request => {
    captured = request;
    return new Promise(resolve => { release = resolve; });
  });
  const project = createProject();
  session.reset(project);
  assert.equal(session.isDirty(project), false);
  project.blocks.push(makeBlock('paragraph', 'Conteúdo para teste de integridade de salvamento.'));
  assert.equal(session.isDirty(project), true);
  const result = session.save(project);
  assert.equal(session.saving, true);
  project.title = 'Título editado durante o envio';
  assert.notEqual(captured!.document.title, project.title);
  await assert.rejects(session.save(project), { status: 409 });
  release(saved(captured!));
  await result;
  assert.equal(session.revision, 1);
  assert.equal(session.saving, false);
  assert.equal(session.isDirty(project), true);
});

test('retry after unconfirmed failure reuses saveId and revision for the exact same content', async () => {
  const requests: SaveRequest[] = [];
  const session = new ProjectSession(async request => {
    requests.push(request);
    if (requests.length === 1) throw new StorageError('Falha não confirmada.', 503);
    return saved(request);
  });
  const project = createProject();
  session.reset(project);
  project.title = 'Salvamento idempotente';
  await assert.rejects(session.save(project), { status: 503 });
  assert.equal(session.isDirty(project), true);
  await session.save(project);
  assert.equal(requests[0].saveId, requests[1].saveId);
  assert.equal(requests[0].revision, requests[1].revision);
  assert.equal(session.isDirty(project), false);
});

test('loaded revisions remain attached to the correct project and new documents restart at zero', async () => {
  const project = createProject();
  const session = new ProjectSession(async request => saved(request));
  session.attach(project, { ...saved({ id: project.id, revision: 6, saveId: crypto.randomUUID(), document: project }) });
  assert.equal(session.revision, 7);
  assert.equal(session.isDirty(project), false);
  const copy = { ...project, id: crypto.randomUUID() };
  assert.throws(() => session.attach(copy, { ...saved({ id: project.id, revision: 1,
    saveId: crypto.randomUUID(), document: project }) }));
  await session.save(copy);
  assert.equal(session.id, copy.id);
  assert.equal(session.revision, 1);
});

test('parent origin accepts exact HTTPS origins and rejects credentials, paths and standalone context', () => {
  const parent = {};
  function host(value: string) { return { location: { href: value }, parent } as unknown as Window; }
  assert.equal(workParentOrigin(host('https://tool.example/?workOrigin=https%3A%2F%2Fwork.example')),
    'https://work.example');
  for (const origin of ['https://work.example/path', 'https://user:pass@work.example',
    'javascript:alert(1)', 'https://work.example.evil/', 'http://work.example']) {
    assert.equal(workParentOrigin(host('https://tool.example/?workOrigin=' + encodeURIComponent(origin))), null);
  }
  const standalone = host('https://tool.example/?workOrigin=https%3A%2F%2Fwork.example');
  Object.assign(standalone, { parent: standalone });
  assert.equal(workParentOrigin(standalone), null);
});
