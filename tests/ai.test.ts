import assert from 'node:assert/strict';
import test from 'node:test';
import { blockSchema, createProject, type DocumentBlock } from '../shared/document';
import { auditProject } from '../shared/integrity';
import { AIError, aiStatus, parseResponse, requestStructured } from '../server/ai/client';
import { applyExplanation, applyIntegralPlan, sourceBatches } from '../server/ai/generate';

const source = [
  blockSchema.parse({id:'art-1',sourceIds:['art-1'],kind:'paragraph',text:'Art. 1º Fica instituído o Programa de Desenvolvimento Profissional.'}),
  blockSchema.parse({id:'art-2',sourceIds:['art-2'],kind:'paragraph',text:'Art. 2º São objetivos do Programa:'}),
];
function projectWith(blocks:DocumentBlock[]) {
  const project=createProject();
  project.source={name:'regulamento.docx',format:'docx',sha256:'a'.repeat(64),blocks:source,warnings:[],pageCount:0,ocr:false};
  project.blocks=blocks; return project;
}

test('integral grouping derives literal wording server-side and passes integrity',()=>{
  const blocks=applyIntegralPlan({groups:[{kind:'steps',sourceIds:['art-1','art-2'],breakBefore:false}]},source);
  assert.equal(blocks[0].items[0].text,source[0].text);
  assert.equal(blocks[0].items[1].text,source[1].text);
  assert.equal(blocks[0].text,'');
  assert.deepEqual(auditProject(projectWith(blocks)),[]);
});

test('integral plan rejects omitted, duplicated, reordered, and unknown source references',()=>{
  for(const ids of [['art-1'],['art-1','art-1'],['art-2','art-1'],['art-1','unknown']]) {
    assert.throws(()=>applyIntegralPlan({groups:ids.map(id=>({sourceIds:[id],kind:'source',breakBefore:false}))},source),AIError);
  }
});

test('a table cannot be turned into a card with lost cells',()=>{
  const table=blockSchema.parse({id:'table',sourceIds:['table'],kind:'table',rows:[['Etapa','Responsável'],['Análise','Diretoria']]});
  assert.throws(()=>applyIntegralPlan({groups:[{sourceIds:['art-1','table'],kind:'cards',breakBefore:false}]},[source[0],table]),AIError);
});

test('integrity catches altered punctuation and text added to a native infographic',()=>{
  const blocks=applyIntegralPlan({groups:[{sourceIds:['art-1','art-2'],kind:'cards',breakBefore:false}]},source);
  blocks[0].items[0].text=blocks[0].items[0].text.replace('.','!');
  assert(auditProject(projectWith(blocks)).some(issue=>issue.severity==='error'));
  blocks[0].items[0].text=source[0].text;
  blocks[0].text='Texto que não estava na origem';
  assert(auditProject(projectWith(blocks)).some(issue=>issue.severity==='error'));
});

test('integrity catches omissions even when the remaining text is unchanged',()=>{
  assert(auditProject(projectWith([source[0]])).some(issue=>/não foi incluído/.test(issue.message)));
});

test('explanatory output requires coverage and real source references',()=>{
  const block={kind:'paragraph',sourceIds:['art-1','art-2'],text:'O Programa reúne objetivos de desenvolvimento profissional.',
    level:1,rows:[],items:[],caption:'',breakBefore:false};
  assert.equal(applyExplanation({blocks:[block]},source).length,1);
  assert.throws(()=>applyExplanation({blocks:[{...block,sourceIds:['art-1']}]},source),AIError);
  assert.throws(()=>applyExplanation({blocks:[{...block,sourceIds:['unknown']}]},source),AIError);
});

test('explanatory output cannot invent image URLs',()=>{
  assert.throws(()=>applyExplanation({blocks:[{kind:'image',sourceIds:['art-1','art-2'],text:'',level:1,
    rows:[],items:[],caption:'',breakBefore:false}]},source),AIError);
});

test('batching preserves every block and exact sequence without truncation',()=>{
  const large=Array.from({length:220},(_,i)=>({...source[0],id:`b${i}`,text:'Conteúdo integral. '.repeat(250)}));
  const batches=sourceBatches(large);
  assert(batches.length>1);
  assert.deepEqual(batches.flat(),large);
  assert.throws(()=>sourceBatches([{...source[0],text:'a'.repeat(120001)}]),AIError);
});

test('Responses parser rejects incomplete output and refusals instead of accepting partial JSON',()=>{
  assert.throws(()=>parseResponse({status:'incomplete',output_text:'{"groups":[]}'}),/incompleta/);
  assert.throws(()=>parseResponse({output:[{content:[{type:'refusal',refusal:'refused'}]}]}),/não pôde/);
  assert.throws(()=>parseResponse({output_text:'not json'}),/estrutura inválida/);
  assert.deepEqual(parseResponse({status:'completed',output:[{content:[{type:'output_text',text:'{"groups":[]}'}]}]}),{groups:[]});
});

test('missing API key gives a genuine unavailable status without a generated substitute',async()=>{
  const previous=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(aiStatus().configured,false);
    await assert.rejects(requestStructured('test',{},[]),error=>error instanceof AIError && error.status===503 && error.code==='not_configured');
  } finally {
    if(previous===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=previous;
  }
});

test('explanatory integrity flags an article reference absent from the original document',()=>{
  const project=projectWith([{...source[0],sourceIds:['art-1','art-2'],text:'O art. 999 determina a inscrição.'}]);
  project.mode='explanatory';
  assert(auditProject(project).some(issue=>issue.severity==='error' && /999/.test(issue.message)));
});

test('explanatory generation must retain an actual table instead of merely citing its source',()=>{
  const table=blockSchema.parse({id:'table',sourceIds:['table'],kind:'table',rows:[['Etapa','Responsável'],['Análise','Diretoria']]});
  assert.throws(()=>applyExplanation({blocks:[{kind:'paragraph',sourceIds:['table'],text:'Há um fluxo de análise.',level:1,
    rows:[],items:[],caption:'',breakBefore:false}]},[table]),error=>error instanceof AIError && error.code==='asset_coverage');
});

test('integral audit detects a type conversion that hides original table or image content',()=>{
  for (const original of [
    blockSchema.parse({id:'table',sourceIds:['table'],kind:'table',rows:[['Etapa','Responsável'],['Análise','Diretoria']]}),
    blockSchema.parse({id:'image',sourceIds:['image'],kind:'image',image:'data:image/png;base64,aW1hZ2U='}),
  ]) {
    const project=projectWith([{...original,kind:'paragraph'}]);
    project.source!.blocks=[original];
    assert(auditProject(project).some(issue=>issue.severity==='error' && /alterado/.test(issue.message)));
  }
});

test('import limitations remain visible in the document audit',()=>{
  const project=projectWith(source);
  project.source!.warnings=['Confira os cabeçalhos e rodapés no original.'];
  assert(auditProject(project).some(issue=>issue.severity==='warning' && /cabeçalhos/.test(issue.message)));
});
