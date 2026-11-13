import { z } from 'zod';
import multer from 'multer';
export function publicError(error:unknown):{status:number;message:string} {
  if(error instanceof z.ZodError)return {status:400,message:'Verifique os dados enviados.'};
  if(error instanceof multer.MulterError)return {status:413,message:'Envie um único arquivo de até 20 MB.'};
  if(typeof error==='object'&&error&&'status'in error&&'message'in error) {
    const status=Number(error.status);
    if(status>=400&&status<=599)return {status,message:String(error.message).slice(0,1200)};
  }
  return {status:500,message:'Não foi possível concluir a operação. O documento aberto foi preservado.'};
}
