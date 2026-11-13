import { createCanvas, ImageData } from '@napi-rs/canvas';
import type { PDFPageProxy } from 'pdfjs-dist';

export type PlacedImage = {x:number; y:number; image:string};
type Matrix = [number,number,number,number,number,number];
const identity: Matrix = [1,0,0,1,0,0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
    a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function toPng(data: {width:number; height:number; data:Uint8Array|Uint8ClampedArray; kind?:number}): string {
  const {width,height} = data;
  if (!width || !height || width>16000 || height>16000 || width*height > 20_000_000) throw new Error('image-size');
  const source = data.data;
  const rgba = new Uint8ClampedArray(width*height*4);
  if (source.length === rgba.length) rgba.set(source);
  else if (source.length === width*height*3) {
    for (let p=0,q=0;p<source.length;p+=3,q+=4) {
      rgba[q]=source[p]; rgba[q+1]=source[p+1]; rgba[q+2]=source[p+2]; rgba[q+3]=255;
    }
  } else if (source.length === Math.ceil(width/8)*height) {
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const value = source[y*Math.ceil(width/8)+(x>>3)] & (128>>(x%8)) ? 255 : 0;
      const q=(y*width+x)*4; rgba[q]=value; rgba[q+1]=value; rgba[q+2]=value; rgba[q+3]=255;
    }
  } else throw new Error('image-format');
  const canvas=createCanvas(width,height);
  canvas.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

export async function extractPdfImages(page: PDFPageProxy, ops: Record<string,number>, warnings: string[], imageCache=new Map<string,string>()) {
  const list=await page.getOperatorList();
  let matrix: Matrix=[...identity];
  const stack: Matrix[]=[];
  const images: PlacedImage[]=[];
  let bytes=0;
  for (let i=0;i<list.fnArray.length;i++) {
    const op=list.fnArray[i], args=list.argsArray[i];
    if (op===ops.save) stack.push([...matrix]);
    else if (op===ops.restore) matrix=stack.pop() || [...identity];
    else if (op===ops.transform) matrix=multiply(matrix,args as Matrix);
    else if (op===ops.paintImageXObject || op===ops.paintInlineImageXObject) {
      try {
        const id=op===ops.paintImageXObject ? String(args[0]) : '';
        let image=id ? imageCache.get(id) : undefined;
        if (!image) {
          const data=op===ops.paintInlineImageXObject ? args[0] : await new Promise<unknown>((resolve,reject) => {
            const timeout=setTimeout(()=>reject(new Error('image-timeout')),4000);
            const cache=id.startsWith('g_') ? page.commonObjs : page.objs;
            cache.get(id, (value:unknown)=>{clearTimeout(timeout);resolve(value);});
          });
          image=toPng(data as Parameters<typeof toPng>[0]);
          if (id) imageCache.set(id,image);
        }
        bytes+=image.length;
        if (bytes>18_000_000 || images.length>=100) throw new Error('image-limit');
        images.push({x:matrix[4],y:Math.max(matrix[5],matrix[5]+matrix[3]),image});
      } catch {
        warnings.push(`Uma imagem da página ${page.pageNumber} exige conferência com o PDF original.`);
      }
    }
  }
  return {images, hasGraphics:list.fnArray.length>20, operatorCount:list.fnArray.length};
}
