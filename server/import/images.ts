import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ImportError } from './errors';
import { validateImage } from '../images';

/** Bound GIF dimensions before native decoding; all formats share the API's image validation. */
export async function importImage(bytes:Buffer,warnings:string[]):Promise<string> {
  if(bytes.length>12*1024*1024)throw new ImportError('Uma imagem do Word excede o limite de 12 MB.');
  const gif=bytes.length>=10 && /^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii'));
  if(gif){
    const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8);
    if(!width || !height || width>16000 || height>16000 || width*height>40_000_000) {
      throw new ImportError('Uma imagem do Word excede o limite de 40 milhões de pixels ou 16 mil pixels por lado.');
    }
    try {
      const decoded=await loadImage(bytes);
      if(decoded.width!==width || decoded.height!==height)throw new Error('dimensions');
      const canvas=createCanvas(width,height);
      canvas.getContext('2d').drawImage(decoded,0,0);
      const data=`data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
      validateImage(data);
      warnings.push('Uma imagem GIF foi convertida em PNG para impressão e armazenamento. Apenas o primeiro quadro é preservado; a animação não é mantida.');
      return data;
    }catch(error){
      if(error instanceof ImportError)throw error;
      throw new ImportError('Uma imagem GIF do Word está inválida ou não pode ser lida com segurança.');
    }
  }
  const format=bytes.subarray(0,4).toString('ascii')==='RIFF'?'webp':bytes[0]===0xff?'jpeg':'png';
  const data=`data:image/${format};base64,${bytes.toString('base64')}`;
  validateImage(data);
  return data;
}
