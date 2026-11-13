import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, makeBlock } from '../shared/document';
import { readGenerationStream } from '../src/services/api';
import type { GenerationProgress, GenerationResult } from '../shared/generation';
const encoder=new TextEncoder();
function result():GenerationResult {
  const project=createProject();project.title='Documento de verificação';
  project.blocks=[makeBlock('paragraph','Conteúdo preservado.')];
  return {project,report:{pages:2,passes:1,visualPages:2,issues:[],status:'reviewed',
    wordValidation:'available',reviewedAt:new Date().toISOString()}};
}
function transport(parts:Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({start(controller){
    for(const part of parts)controller.enqueue(part);controller.close();
  }}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
function event(name:string,data:unknown) {return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;}
test('stream reader preserves fragmented UTF-8, real progress counts and complete generated document',async()=>{
  const output=result();const progress:GenerationProgress[]=[];
  const input=encoder.encode(': connection heartbeat\n\n'+event('progress',{stage:'plan',message:'Planejando a composição…',current:1,total:3})
    +event('progress',{stage:'review',message:'Conferindo páginas',current:2,total:2})+event('result',output));
  const parts:Array<Uint8Array>=[];for(let i=0;i<input.length;i+=7)parts.push(input.subarray(i,i+7));
  const parsed=await readGenerationStream(transport(parts),undefined,value=>progress.push(value));
  assert.deepEqual(parsed,output);assert.equal(progress.length,2);
  assert.equal(progress[0].message,'Planejando a composição…');assert.equal(progress[1].current,2);
  assert.deepEqual(progress[1].visitedStages,['plan','review']);
});
test('progress completion without an actual result is an interrupted operation',async()=>{
  const response=transport([encoder.encode(event('progress',{stage:'complete',message:'Conferência concluída.'}))]);
  await assert.rejects(()=>readGenerationStream(response),/interrompida antes da entrega/);
});
test('stream reader surfaces actual server errors and rejects malformed events',async()=>{
  await assert.rejects(()=>readGenerationStream(transport([encoder.encode(event('error',{error:'A OpenAI informou limite de uso.'}))])),/limite de uso/);
  for(const payload of [{stage:'invented',message:'Etapa inexistente'},
    {stage:'review',message:'Contagem inválida',current:4,total:2}])
    await assert.rejects(()=>readGenerationStream(transport([encoder.encode(event('progress',payload))])));
  await assert.rejects(()=>readGenerationStream(transport([encoder.encode('event: result\ndata: {broken}\n\n')])),/inválido/);
});
test('a truncated or invalid result never becomes the successful project',async()=>{
  const output=result();
  await assert.rejects(()=>readGenerationStream(transport([encoder.encode(event('result',{...output,project:{title:'Incompleto'}}))])),/validação de estrutura/);
  await assert.rejects(()=>readGenerationStream(transport([encoder.encode(event('result',output).slice(0,-4))])),/interrompida/);
  await assert.rejects(()=>readGenerationStream(new Response('{}')),/não iniciou/);
});
test('reader cancellation respects AbortSignal before applying any result',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>readGenerationStream(transport([encoder.encode(event('result',result()))]),controller.signal),
    error=>error instanceof DOMException&&error.name==='AbortError');
});
