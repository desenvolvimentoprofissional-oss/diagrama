import type { Response } from 'express';
import type { DocumentProject } from '../../shared/document';
import { publicError } from '../http-errors';
import { generateDocument } from './pipeline';
export async function streamGeneration(res:Response,project:DocumentProject,instructions:string) {
  const controller=new AbortController();
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('X-Accel-Buffering','no');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders();
  const write=(event:string,data:unknown)=>{
    if(!res.destroyed&&!res.writableEnded)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat=setInterval(()=>{
    if(!res.destroyed&&!res.writableEnded)res.write(': processando\n\n');
  },15000);
  res.once('close',()=>{if(!res.writableEnded)controller.abort();});
  try {
    const result=await generateDocument(project,instructions,{signal:controller.signal,
      onProgress:progress=>write('progress',progress)});
    write('result',result);
  } catch(error) {
    const safe=publicError(error);
    write('error',{error:safe.message,status:safe.status});
  } finally {clearInterval(heartbeat);if(!res.destroyed)res.end();}
}
