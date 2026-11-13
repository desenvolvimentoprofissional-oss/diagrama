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

test('institutional decision graph renders native branches, complete labels and automatic CRA-SP identity',async()=>{
  const project=createProject();project.title='Cooperação e condições de participação';project.toc=false;
  const diagram={...makeBlock('diagram','Fluxo de análise e aprovação'),layout:'decision' as const,
    nodes:[{id:'start',label:'Recebimento',detail:'A proposta é recebida e registrada.',sourceIds:[]},
      {id:'yes',label:'Atende aos critérios',detail:'Encaminhar para análise.',sourceIds:[]},
      {id:'no',label:'Necessita complementação',detail:'Solicitar documentação.',sourceIds:[]},
      {id:'end',label:'Deliberação',detail:'Apreciar a proposta instruída.',sourceIds:[]}],
    edges:[{from:'start',to:'yes',label:'Completa'},{from:'start',to:'no',label:'Pendente'},
      {from:'yes',to:'end',label:''},{from:'no',to:'end',label:''}]};
  project.blocks=[diagram];
  const result=await withDocumentPage(project,page=>page.evaluate(()=>{
    const figure=document.querySelector<HTMLElement>('.dg-diagram')!;
    const nodes=[...figure.querySelectorAll<HTMLElement>('.dg-diagram-node')];
    const bounds=figure.getBoundingClientRect();
    return {nodes:nodes.map(node=>node.textContent),paths:figure.querySelectorAll('svg > path').length,
      logo:(document.querySelector('.dg-header img') as HTMLImageElement).naturalWidth,
      clipping:nodes.some(node=>{const rect=node.getBoundingClientRect();return rect.left<bounds.left||rect.right>bounds.right||rect.bottom>bounds.bottom;}),
      issues:(window as any).__layoutResult.issues};
  }));
  assert.equal(result.nodes.length,4);assert.match(result.nodes.join(' '),/Solicitar documentação/);
  assert.equal(result.paths,4);assert.ok(result.logo>0);assert.equal(result.clipping,false);assert.deepEqual(result.issues,[]);
});

test('physical composition captures exact table fragments, graphic data and populated TOC pages for Word',async()=>{
  const {readDocumentComposition}=await import('../server/export/browser');
  const project=createProject();project.cover=false;
  project.blocks=[makeBlock('heading','Requisitos de participação'),
    {...makeBlock('table'),rows:[['Critério','Evidência'],['Gratuidade','Declaração e condições da oferta.']]},
    {...makeBlock('diagram','Etapas'),layout:'process',nodes:[{id:'one',label:'Solicitar',detail:'Apresentar a proposta.',sourceIds:[]}],edges:[]}];
  const composition=await readDocumentComposition(project);
  assert.equal(composition.pages[0].kind,'toc');assert.equal(composition.toc[0].page,2);
  const fragments=composition.pages.flatMap(page=>page.fragments);
  assert.deepEqual(fragments.find(fragment=>fragment.kind==='table')?.rows,project.blocks[1].rows);
  assert.equal(fragments.find(fragment=>fragment.kind==='diagram')?.nodes[0].label,'Solicitar');
  assert.ok(fragments.every(fragment=>fragment.top>=30&&fragment.top+fragment.height<=273.1));
  assert.deepEqual(composition.issues,[]);
});

test('consecutive section and infographic titles stay with a large graph and skip-edge labels remain clear',async()=>{
  const {inspectDocument,readDocumentComposition}=await import('../server/export/browser');
  const project=createProject();project.cover=false;
  const heading=makeBlock('heading','Fluxo de análise e aprovação');heading.level=2;
  const nodes=Array.from({length:7},(_,index)=>({id:`stage-${index}`,label:`Etapa ${index+1}`,
    detail:'Conferência e encaminhamento da documentação.',sourceIds:[]}));
  const edges=nodes.slice(0,-1).map((node,index)=>({from:node.id,to:nodes[index+1].id,label:''}));
  edges.push({from:nodes[1].id,to:nodes[6].id,label:'Sem pendência'});
  const graph={...makeBlock('diagram','Da proposta à decisão'),layout:'decision' as const,nodes,edges};
  project.blocks=[makeBlock('paragraph','Condições de participação e responsabilidades institucionais. '.repeat(50)),heading,graph];
  const inspected=await inspectDocument(project);assert.deepEqual(inspected.issues,[]);
  const composition=await readDocumentComposition(project);
  const pageWithGraph=composition.pages.find(page=>page.fragments.some(fragment=>fragment.kind==='diagram'))!;
  assert.ok(pageWithGraph.fragments.some(fragment=>fragment.blockId===heading.id));
  assert.ok(pageWithGraph.fragments.some(fragment=>fragment.role==='component-title'));
  assert.deepEqual(composition.pages.flatMap(page=>page.tocEntries||[]),composition.toc);
});
