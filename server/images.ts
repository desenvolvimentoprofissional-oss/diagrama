import { ApiError } from './auth';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 16_000;
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
type Dimensions = {width:number;height:number};

function invalid(): never {
  throw new ApiError(400, 'Uma imagem do documento está inválida. Envie novamente o arquivo PNG, JPEG ou WebP.');
}
function dimensions(width:number,height:number): Dimensions {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) invalid();
  if (width > MAX_SIDE || height > MAX_SIDE || width*height > MAX_PIXELS) {
    throw new ApiError(400, 'Uma imagem excede 40 milhões de pixels ou 16.000 pixels em uma dimensão. Reduza-a antes de continuar.');
  }
  return {width,height};
}
function staticOnly(): never {
  throw new ApiError(400, 'Use uma imagem estática PNG, JPEG ou WebP no documento. Imagens animadas devem ser convertidas antes de continuar.');
}

function png(bytes:Buffer): void {
  if (bytes.length < 45 || !bytes.subarray(0,8).equals(pngSignature)) invalid();
  let offset = 8;
  let header = false, pixels = false, end = false;
  let chunks = 0;
  while (offset < bytes.length) {
    if (++chunks > 50000 || offset+12 > bytes.length) invalid();
    const length = bytes.readUInt32BE(offset);
    const name = bytes.toString('latin1',offset+4,offset+8);
    const data = offset+8;
    if (length > bytes.length-data-4) invalid();
    if (!header) {
      if (name !== 'IHDR' || length !== 13) invalid();
      dimensions(bytes.readUInt32BE(data),bytes.readUInt32BE(data+4));
      const bitDepth = bytes[data+8], color = bytes[data+9];
      const allowed:Record<number,number[]> = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if (!allowed[color]?.includes(bitDepth) || bytes[data+10] !== 0 || bytes[data+11] !== 0 || bytes[data+12] > 1) invalid();
      header = true;
    } else if (name === 'IHDR') invalid();
    if (['acTL','fcTL','fdAT'].includes(name)) staticOnly();
    if (name === 'IDAT' && length) pixels = true;
    offset = data+length+4;
    if (name === 'IEND') {if(length || offset !== bytes.length) invalid();end = true;break;}
  }
  if (!header || !pixels || !end) invalid();
}

function jpeg(bytes:Buffer): void {
  if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216) invalid();
  const startOfFrame = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset = 2, entropy = false, frame = false, scan = false, markers = 0;
  while (offset < bytes.length) {
    if (++markers > 100000) invalid();
    if (entropy) {
      const next = bytes.indexOf(255,offset);
      if (next < 0) invalid();
      offset = next;
    }
    if (bytes[offset++] !== 255) invalid();
    while (offset < bytes.length && bytes[offset] === 255) offset++;
    if (offset >= bytes.length) invalid();
    const marker = bytes[offset++];
    if (entropy && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9) {if(!frame || !scan) invalid();return;}
    entropy = false;
    if (marker === 0xd8 || marker === 0 || marker === 0xdc) invalid();
    if (marker === 0x01) continue;
    if (offset+2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset+length > bytes.length) invalid();
    if (startOfFrame.has(marker)) {
      if (frame || length < 11) invalid();
      const count = bytes[offset+7];
      if (count < 1 || count > 4 || length !== 8+count*3) invalid();
      dimensions(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3));
      frame = true;
    }
    if (marker === 0xda) {if(!frame) invalid();scan = true;entropy = true;}
    offset += length;
  }
  invalid();
}

function webp(bytes:Buffer): void {
  if (bytes.length < 20 || bytes.toString('latin1',0,4) !== 'RIFF' || bytes.toString('latin1',8,12) !== 'WEBP'
    || bytes.readUInt32LE(4)+8 !== bytes.length) invalid();
  let offset = 12;
  let canvas:Dimensions|undefined, frame:Dimensions|undefined;
  let chunks = 0;
  while (offset < bytes.length) {
    if (++chunks > 50000 || offset+8 > bytes.length) invalid();
    const name = bytes.toString('latin1',offset,offset+4), size = bytes.readUInt32LE(offset+4), data = offset+8;
    if (size > bytes.length-data) invalid();
    if (name === 'ANIM' || name === 'ANMF') staticOnly();
    if (name === 'VP8X') {
      if (canvas || offset !== 12 || size !== 10) invalid();
      if (bytes[data] & 2) staticOnly();
      canvas = dimensions(bytes.readUIntLE(data+4,3)+1,bytes.readUIntLE(data+7,3)+1);
    }
    if (name === 'VP8 ') {
      if (frame || size < 10 || bytes[data]&1 || bytes.toString('hex',data+3,data+6) !== '9d012a') invalid();
      frame = dimensions(bytes.readUInt16LE(data+6)&0x3fff,bytes.readUInt16LE(data+8)&0x3fff);
    }
    if (name === 'VP8L') {
      if (frame || size < 5 || bytes[data] !== 0x2f) invalid();
      const bits = bytes.readUInt32LE(data+1);
      if (bits>>>29) invalid();
      frame = dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
    }
    offset = data+size+(size&1);
  }
  if (offset !== bytes.length || !frame || (canvas && (canvas.width !== frame.width || canvas.height !== frame.height))) invalid();
}

/** Validate raster metadata before any browser or native image decoder allocates its pixel buffer. */
export function validateImage(dataURL:string): void {
  if (!dataURL) return;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL);
  if (!match || match[2].length%4) invalid();
  if (match[2].length > Math.ceil(MAX_BYTES/3)*4) {
    throw new ApiError(400, 'Uma imagem ultrapassa o limite de 12 MB. Reduza-a antes de continuar.');
  }
  const bytes = Buffer.from(match[2],'base64');
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== match[2]) invalid();
  if (match[1] === 'png') png(bytes);
  else if (match[1] === 'jpeg') jpeg(bytes);
  else webp(bytes);
}
