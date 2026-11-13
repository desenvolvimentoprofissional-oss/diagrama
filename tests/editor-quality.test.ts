import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GenerationStatus,QualitySummary} from '../src/editor/GenerationStatus';
import {DiagramEditor} from '../src/editor/DiagramEditor';
import {AiPanel} from '../src/editor/AiPanel';
import {createProject,makeBlock} from '../shared/document';
import type {QualityReport} from '../shared/generation';
const noChange=()=>{};
test('automatic CRA-SP mode does not require a prompt to enable generation',()=>{
  const project=createProject();project.source={name:'documento.docx',format:'docx',sha256:'a'.repeat(64),
    blocks:[makeBlock('paragraph','Texto de origem.')],warnings:[],pageCount:0,ocr:false};
  const html=renderToStaticMarkup(createElement(AiPanel,{project,busy:false,configured:true,onMode:noChange,onGenerate:noChange}));
  assert.match(html,/Padrão CRA-SP automático/);assert.match(html,/O envio do documento inicia a geração/);
  assert.match(html,/opcional/);assert.match(html,/Gerar documento/);
  assert.doesNotMatch(html,/<textarea[^>]*required/);
  assert.doesNotMatch(html,/<button[^>]*disabled[^>]*>[^]*?Gerar documento/);
});
test('generation status displays actual supplied counts, with no invented percentage',()=>{
  const counted=renderToStaticMarkup(createElement(GenerationStatus,{busy:true,progress:{stage:'review',message:'Conferindo páginas.',current:3,total:7}}));
  assert.match(counted,/3<!-- --> de <!-- -->7|3 de 7/);assert.match(counted,/aria-current="step"/);
  assert.doesNotMatch(counted,/%/);
  const uncounted=renderToStaticMarkup(createElement(GenerationStatus,{busy:true,progress:{stage:'plan',message:'Organizando o documento.'}}));
  assert.doesNotMatch(uncounted,/<output/);
});
test('quality summary states an unavailable Word review instead of implying approval',()=>{
  const report:QualityReport={pages:12,passes:2,visualPages:12,issues:[{severity:'warning',message:'Confira a tabela.'}],
    status:'needs-review',wordValidation:'unavailable',reviewedAt:new Date().toISOString()};
  const html=renderToStaticMarkup(createElement(QualitySummary,{report,onIssues:noChange}));
  assert.match(html,/Conferência com apontamentos/);assert.match(html,/conferência visual do Word não está disponível/);
  assert.doesNotMatch(html,/documento aprovado|qualidade garantida/i);
  report.wordValidation='failed';
  const failed=renderToStaticMarkup(createElement(QualitySummary,{report,onIssues:noChange}));
  assert.match(failed,/conferência do Word não foi concluída/);assert.doesNotMatch(failed,/Word renderizado e conferido/);
});
test('diagram editor exposes editable nodes, real connections, layout and source bindings',()=>{
  const project=createProject();const block=makeBlock('diagram','Fluxo de participação');
  block.layout='decision';block.nodes=[{id:'one',label:'Recebimento',detail:'Manifestação institucional.',sourceIds:[]},
    {id:'two',label:'Análise',detail:'Exame dos critérios.',sourceIds:[]}];
  block.edges=[{from:'one',to:'two',label:'Encaminhamento'}];
  const html=renderToStaticMarkup(createElement(DiagramEditor,{project,block,onChange:noChange}));
  assert.match(html,/Recebimento/);assert.match(html,/Manifestação institucional/);assert.match(html,/Encaminhamento/);
  assert.match(html,/Organização visual/);assert.match(html,/Adicionar conexão/);assert.match(html,/Linha do tempo/);
  assert.doesNotMatch(html,/Revise as conexões/);
  block.edges.push({...block.edges[0]});
  assert.match(renderToStaticMarkup(createElement(DiagramEditor,{project,block,onChange:noChange})),/Revise as conexões/);
});

test('unexecuted refinement is optional rather than falsely checked at completion',()=>{
  const html=renderToStaticMarkup(createElement(GenerationStatus,{busy:false,progress:{stage:'complete',
    message:'Documento gerado.',visitedStages:['analyze','plan','compose','paginate','review','complete']}}));
  assert.match(html,/<li class="is-skipped"><span>[^]*?Refinamento<em>opcional<\/em>/);
  assert.equal((html.match(/class="is-done"/g)||[]).length,5);
});
