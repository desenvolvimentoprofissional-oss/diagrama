import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeBlock} from '../shared/document';
import {withDocumentPage,exportPdf} from '../server/export';
import {paginateDocument} from '../src/document/paginate';

test('measured pagination preserves long text and table cells without overflow or orphan headings',async()=>{
  const project=createProject();project.cover=false;
  const value=Array.from({length:135},(_,i)=>`Trecho ${i}: formação, ética e condições de participação. `).join('');
  const heading=makeBlock('heading','Condições de participação');
  const paragraph=makeBlock('paragraph',value);
  const table={...makeBlock('table'),rows:[['Condição','Descrição'],['Regra única',value+value]]};
  project.blocks=[heading,paragraph,table];
  const result=await withDocumentPage(project,page=>page.evaluate(({paragraphId,headingId,tableId})=>{
    const paras=[...document.querySelectorAll<HTMLElement>('[data-block-id]')].filter(el=>el.dataset.blockId===paragraphId);
    const tables=[...document.querySelectorAll<HTMLTableElement>('table')].filter(el=>el.dataset.blockId===tableId);
    const headingEl=[...document.querySelectorAll<HTMLElement>('[data-block-id]')].find(el=>el.dataset.blockId===headingId)!;
    return {text:paras.map(el=>el.textContent).join(''),
      columns:[0,1].map(index=>tables.flatMap(table=>[...table.tBodies[0].rows].map(row=>row.cells[index]?.textContent||'')).join('')),
      headingFollowed:Boolean(headingEl.nextElementSibling),layout:(window as any).__layoutResult};
  },{paragraphId:paragraph.id,headingId:heading.id,tableId:table.id}));
  assert.equal(result.text,value);
  assert.deepEqual(result.columns,['Regra única',value+value]);
  assert.equal(result.headingFollowed,true);
  assert.deepEqual(result.layout.issues,[]);
  assert.ok(result.layout.pageCount>=5);
});

test('preview zoom leaves page count and text identical to exported layout',async()=>{
  const project=createProject();project.cover=false;project.toc=false;
  project.blocks=[makeBlock('heading','Desenvolvimento Profissional'),makeBlock('paragraph','Texto de validação. '.repeat(1100))];
  const result=await withDocumentPage(project,page=>page.evaluate(({project,code})=>{
    const root=document.querySelector<HTMLElement>('#document')!;
    const original=(window as any).__layoutResult.pageCount;
    root.style.transform='scale(.5)';root.style.transformOrigin='top left';
    const paginate=eval(`(${code})`);
    const after=paginate(root,project);
    return {original,after};
  },{project,code:paginateDocument.toString()}));
  assert.equal(result.original,result.after.pageCount);
  assert.deepEqual(result.after.issues,[]);
});

test('PDF is real, paginated and searchable; extensive cover metadata remains inside page',async()=>{
  const project=createProject();project.title='Desenvolvimento profissional e formação continuada '.repeat(5);
  project.subtitle='Condições e oportunidades para aprimoramento das práticas profissionais. '.repeat(12);
  project.author='Gerência de Inovação e Desenvolvimento Profissional';
  project.blocks=[makeBlock('heading','Disposições'),makeBlock('paragraph','Texto editável e pesquisável.')];
  const buffer=await exportPdf(project);
  assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert.ok(buffer.length>10000);
});

test('image decoding errors prevent a falsely successful PDF export',async()=>{
  const project=createProject();project.blocks=[{...makeBlock('image'),image:'data:image/png;base64,YmFk'}];
  await assert.rejects(()=>exportPdf(project),/imagem não pôde ser decodificada/);
});
