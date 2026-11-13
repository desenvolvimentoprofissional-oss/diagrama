import test from 'node:test';
import assert from 'node:assert/strict';
import {blockSchema,createProject,type DocumentProject} from '../shared/document';
import {auditProject,blockText} from '../shared/integrity';
import {explicitProcedures,validateEditorialPlan,type EditorialPlan} from '../server/ai/contracts';
import {validateDigest} from '../server/ai/plan';
import {applyExplanation,validateGraph} from '../server/ai/composition-contracts';
import {applyRepairs,applyIntegralRepairs} from '../server/ai/repair';
import {validateMeaningReview} from '../server/ai/meaning';
import {carriesPlannedVisual,plannedStyle} from '../server/ai/compose';
import {retryDelay} from '../server/ai/client';
const originals=[
  blockSchema.parse({id:'s1',kind:'paragraph',sourceIds:['s1'],text:'A Gerência analisa a proposta.'}),
  blockSchema.parse({id:'s2',kind:'paragraph',sourceIds:['s2'],text:'A Diretoria aprova a proposta.'}),
];
function publication():DocumentProject {
  return {...createProject(),source:{name:'processo.docx',format:'docx',sha256:'a'.repeat(64),blocks:originals,
    warnings:[],pageCount:0,ocr:false},blocks:originals.map(block=>({...block}))};
}
function editorial():EditorialPlan {
  return {title:'Participação de instituições em cursos e trilhas',subtitle:'Critérios e fluxo de aprovação',
    documentType:'regulation',purpose:'Explicar como participar.',audience:'Instituições interessadas.',synopsis:'Análise seguida de aprovação.',
    organization:'Apresentar requisitos antes do fluxo.',sections:[{id:'sec1',title:'Da análise à aprovação',
      summary:'Duas instâncias com atribuições diferentes.',sourceIds:['s1','s2'],visual:'process',
      visualPurpose:'Identificar a sequência e os responsáveis.',visualSourceIds:['s1','s2'],headingLevel:1}],cautions:[]};
}
function diagram() {
  return blockSchema.parse({id:'flow',kind:'diagram',text:'Análise e aprovação',layout:'process',sourceIds:['s1','s2'],
    nodes:[{id:'n1',label:'Analisar',detail:'Gerência',sourceIds:['s1']},{id:'n2',label:'Aprovar',detail:'Diretoria',sourceIds:['s2']}],
    edges:[{from:'n1',to:'n2',label:'Encaminhar'}]});
}
test('editorial plan covers whole source and rejects a chapter label as cover title',()=>{
  assert.equal(validateEditorialPlan(editorial(),originals).title,editorial().title);
  for(const title of ['CAPÍTULO I','Anexo II','Sumário'])assert.throws(()=>validateEditorialPlan({...editorial(),title},originals),/título/);
  assert.throws(()=>validateEditorialPlan({...editorial(),sections:[{...editorial().sections[0],sourceIds:['s1']}]},originals),/origem/);
});
test('visual planning requires a factual purpose and evidence inside its own section',()=>{
  assert.throws(()=>validateEditorialPlan({...editorial(),sections:[{...editorial().sections[0],visualPurpose:''}]},originals),/finalidade/);
  assert.throws(()=>validateEditorialPlan({...editorial(),sections:[{...editorial().sections[0],visualSourceIds:['unknown']}]},originals),/evidência/);
});
test('global chunk analysis cannot omit or repeat a source ID',()=>{
  const raw={titleCandidate:'Processo',summary:'Análise e decisão',groups:[{sourceIds:['s1','s2'],title:'Fluxo',
    meaning:'Análise da Gerência antes da aprovação.',conditions:[],relationship:'Sequencial'}]};
  assert.equal(validateDigest(raw,originals).groups.length,1);
  assert.throws(()=>validateDigest({...raw,groups:[{...raw.groups[0],sourceIds:['s1']}]},originals),/trechos/);
  assert.throws(()=>validateDigest({...raw,groups:[{...raw.groups[0],sourceIds:['s1','s1']}]},originals),/trechos/);
});
test('native flow accepts known evidence and rejects dangling, circular or invented relations',()=>{
  assert.doesNotThrow(()=>validateGraph(diagram()));
  assert.throws(()=>validateGraph({...diagram(),edges:[{from:'n1',to:'ghost',label:''}]}),/ligação/);
  assert.throws(()=>validateGraph({...diagram(),edges:[...diagram().edges!,{from:'n2',to:'n1',label:''}]}),/ciclo/);
  assert.throws(()=>validateGraph({...diagram(),nodes:[{...diagram().nodes![0],sourceIds:['unknown']},diagram().nodes![1]]}),/origem/);
});
test('explanatory source reuse supports visual and detailed text without a false duplication finding',()=>{
  const project=publication();project.blocks=[diagram(),...originals];
  assert.equal(auditProject(project).filter(issue=>issue.severity==='error'||issue.severity==='warning').length,0);
  assert.match(blockText(diagram()),/Diretoria/);
});
test('diagram content is included in article-reference and integrity checks',()=>{
  const project=publication();const block=diagram();block.nodes![0].detail='Segundo o art. 999, deve analisar.';
  project.blocks=[block];assert(auditProject(project).some(issue=>issue.severity==='error'&&/999/.test(issue.message)));
});
test('custom branding is applied only when explicitly requested, leaving automatic defaults intact',()=>{
  const project=publication();const plan=editorial();plan.style={customized:true,primary:'#663399',accent:'#cc8800',
    fontSize:12,organization:'Instituição solicitada',cover:false,toc:false,reason:'Pedido do usuário.'};
  assert.deepEqual(plannedStyle(project,plan,''),{});
  assert.equal(plannedStyle(project,plan,'Usar identidade roxa e retirar capa.').theme?.primary,'#663399');
  plan.style.customized=false;assert.deepEqual(plannedStyle(project,plan,'Organize melhor os assuntos.'),{});
});
test('targeted refinement rejects unknown targets and preserves source coverage',()=>{
  const project=publication();
  assert.throws(()=>applyRepairs({removeIds:['s1'],replacements:[]},project),/integridade/);
  assert.throws(()=>applyRepairs({removeIds:[],replacements:[{targetId:'unknown',blocks:[originals[0]]}]},project),/inexistentes/);
  const replacement={kind:'callout',sourceIds:['s1'],text:'A análise é responsabilidade da Gerência.',
    level:1,rows:[],items:[],caption:'',breakBefore:false};
  const result=applyRepairs({removeIds:[],replacements:[{targetId:'s1',blocks:[replacement]}]},project);
  assert.equal(result.blocks[0].id,'s1');assert.deepEqual(result.source,project.source);
});
test('integral refinement changes composition while preserving wording and original sequence',()=>{
  const project=publication();project.mode='integral';
  const result=applyIntegralRepairs({changes:[{id:'s1',treatment:'callout',breakBefore:true,level:1}]},project);
  assert.equal(result.blocks[0].text,originals[0].text);assert.equal(result.blocks[0].kind,'callout');
  assert.equal(result.blocks[0].breakBefore,true);assert.equal(auditProject(result).filter(issue=>issue.severity==='error').length,0);
});
test('semantic review accepts only actual component references',()=>{
  assert.equal(validateMeaningReview({issues:[{severity:'error',blockId:'flow',message:'A sequência foi invertida.'}]},new Set(['flow'])).length,1);
  assert.throws(()=>validateMeaningReview({issues:[{severity:'error',blockId:'unknown',message:'Erro.'}]},new Set(['flow'])),/referência/);
});
test('real provider retry delay respects bounded Retry-After without retrying fake successes',()=>{
  assert.equal(retryDelay('2',0),2000);assert.equal(retryDelay('1000',0),30000);
  assert.equal(retryDelay(null,1),2000);assert.equal(retryDelay('-1',0),250);
});


test('explicit ordered approval stages require an actual process visual while parallel requirements do not',()=>{
  const source=[blockSchema.parse({id:'anchor',kind:'paragraph',sourceIds:['anchor'],
    text:'A análise e a aprovação obedecerão às seguintes etapas:'}),
    ...['I — Receber a proposta.','II — Analisar os documentos.','III — Deliberar sobre a participação.']
      .map((text,index)=>blockSchema.parse({id:`stage${index}`,kind:'paragraph',sourceIds:[`stage${index}`],text}))];
  assert.equal(explicitProcedures(source).length,1);
  const plan=editorial();plan.sections=[{...plan.sections[0],sourceIds:source.map(block=>block.id),
    visual:'none',visualPurpose:'',visualSourceIds:[]}];
  assert.throws(()=>validateEditorialPlan(plan,source),/etapas explícitas/);
  plan.sections[0].visual='process';plan.sections[0].visualPurpose='Mostrar instâncias sucessivas de aprovação.';
  plan.sections[0].visualSourceIds=source.slice(1).map(block=>block.id);
  assert.doesNotThrow(()=>validateEditorialPlan(plan,source));
  const requirements=[{...source[0],text:'São condições obrigatórias para a aceitação:'},...source.slice(1)];
  plan.sections[0].visual='none';plan.sections[0].visualPurpose='';plan.sections[0].visualSourceIds=[];
  assert.equal(explicitProcedures(requirements).length,0);
  assert.doesNotThrow(()=>validateEditorialPlan(plan,requirements));
});


test('a planned flow must carry evidence for every planned stage in actual native nodes',()=>{
  const section=editorial().sections[0];
  assert.equal(carriesPlannedVisual([diagram()],section),true);
  const partial=diagram();partial.nodes![1].sourceIds=['s1'];
  assert.equal(carriesPlannedVisual([partial],section),false);
  assert.equal(carriesPlannedVisual([{...diagram(),kind:'paragraph',nodes:[],edges:[]}],section),false);
});
