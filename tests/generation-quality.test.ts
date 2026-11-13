import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject,makeBlock, type ReviewIssue } from '../shared/document';
import { ensureGenerationInput,repairableIssues,issueScore,uniqueIssues,throwIfAborted } from '../server/generation/quality';

test('generation rejects empty sources and bounds work before billable planning',()=>{
 const project=createProject();assert.throws(()=>ensureGenerationInput(project));
 project.source={name:'entrada',format:'text',sha256:'',pageCount:0,ocr:false,warnings:[],blocks:[makeBlock('paragraph','   ')]};
 assert.throws(()=>ensureGenerationInput(project));
 project.source.blocks=[makeBlock('paragraph','Uma proposta de formação profissional.')];
 assert.doesNotThrow(()=>ensureGenerationInput(project));
 project.source.blocks=Array.from({length:2001},()=>makeBlock('paragraph','a'));assert.throws(()=>ensureGenerationInput(project));
 project.source.blocks=[makeBlock('paragraph','a'.repeat(240001))];assert.throws(()=>ensureGenerationInput(project));
});
test('quality repairs target real composition and semantic issues, preserving informational notices',()=>{
 const issues:ReviewIssue[]=[{severity:'info',message:'Versão explicativa.'},
  {severity:'warning',message:'PDF pode ter limitações de extração.'},
  {severity:'warning',message:'Título isolado.',page:3},
  {severity:'error',message:'Um requisito foi omitido.',blockId:'a'}];
 assert.equal(repairableIssues(issues).length,2);
 assert.ok(issueScore(issues)>issueScore(issues.slice(0,3)));
 assert.equal(uniqueIssues([...issues,issues[3]]).length,4);
});
test('cancellation is observable before calling providers or rendering additional formats',()=>{
 const controller=new AbortController();assert.doesNotThrow(()=>throwIfAborted(controller.signal));
 controller.abort();assert.throws(()=>throwIfAborted(controller.signal),/cancelada/);
});
