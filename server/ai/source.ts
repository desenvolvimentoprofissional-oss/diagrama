import type {DocumentBlock,DocumentProject} from '../../shared/document';
import {AIError} from './client';
export function inputBlock(block:DocumentBlock) {
  const {image,...rest}=block;
  return {...rest,hasImage:Boolean(image)};
}
export function sourceBatches(blocks:DocumentBlock[]):DocumentBlock[][] {
  const batches:DocumentBlock[][]=[];
  let current:DocumentBlock[]=[];let length=0;
  for(const block of blocks){
    const size=JSON.stringify(inputBlock(block)).length;
    if(size>120000)throw new AIError('Um bloco da origem é muito extenso para a análise. Divida-o antes de continuar.',422,'block_too_large');
    if(current.length&&(length+size>38000||current.length>=90)){batches.push(current);current=[];length=0;}
    current.push(block);length+=size;
  }
  if(current.length)batches.push(current);
  return batches;
}
export function requireSource(project:DocumentProject,instructions:string) {
  if(!project.source?.blocks.length)throw new AIError('Importe um documento antes de solicitar a diagramação.',422,'no_source');
  if(instructions.length>6000)throw new AIError('As orientações devem ter até 6.000 caracteres.',422,'instructions_too_large');
  return project.source.blocks;
}
export function checkCancelled(signal?:AbortSignal) {
  if(signal?.aborted)throw new AIError('A operação foi cancelada.',499,'cancelled');
}
