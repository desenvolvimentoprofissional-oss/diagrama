import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas} from '@napi-rs/canvas';
import {validateImage} from '../server/images';
import {ApiError} from '../server/auth';

function raster(format:'png'|'jpeg'|'webp',width=120,height=80):string {
  const canvas=createCanvas(width,height);
  const context=canvas.getContext('2d');context.fillStyle='#183364';context.fillRect(0,0,width,height);
  const buffer=format==='png'?canvas.toBuffer('image/png'):format==='jpeg'?canvas.toBuffer('image/jpeg'):canvas.toBuffer('image/webp');
  return `data:image/${format};base64,${buffer.toString('base64')}`;
}
function modify(data:string, change:(bytes:Buffer)=>void):string {
  const [header,body]=data.split(',');const bytes=Buffer.from(body,'base64');change(bytes);
  return `${header},${bytes.toString('base64')}`;
}

test('raster metadata validator accepts real PNG, JPEG and WebP output from a native encoder',()=>{
  for(const format of ['png','jpeg','webp'] as const)assert.doesNotThrow(()=>validateImage(raster(format)));
  assert.doesNotThrow(()=>validateImage(''));
});
test('raster validator rejects URLs, SVG, GIF, fake payloads and MIME spoofing',()=>{
  for(const image of ['https://example.com/image.png','data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==','data:image/png;base64,aW1hZ2U=',
    raster('png').replace('image/png','image/jpeg')])assert.throws(()=>validateImage(image),ApiError);
});
test('PNG dimensions are checked before any pixel decoder runs',()=>{
  const image=raster('png');
  assert.throws(()=>validateImage(modify(image,bytes=>bytes.writeUInt32BE(16001,16))),/16.000/);
  assert.throws(()=>validateImage(modify(image,bytes=>{bytes.writeUInt32BE(10000,16);bytes.writeUInt32BE(5000,20);})),/40 milhões/);
  assert.throws(()=>validateImage(modify(image,bytes=>bytes.writeUInt32BE(0,16))),ApiError);
});
test('PNG missing complete chunks is rejected instead of silently producing a broken image',()=>{
  const image=raster('png'),[head,data]=image.split(',');
  const bytes=Buffer.from(data,'base64');
  assert.throws(()=>validateImage(`${head},${bytes.subarray(0,33).toString('base64')}`),ApiError);
});
test('JPEG start of frame is required and its dimensions cannot exceed the raster limit',()=>{
  const image=raster('jpeg');
  const changed=modify(image,bytes=>{
    let offset=2;
    while(offset<bytes.length){
      assert.equal(bytes[offset],255);const marker=bytes[offset+1],length=bytes.readUInt16BE(offset+2);
      if(marker===0xc0||marker===0xc2){bytes.writeUInt16BE(16001,offset+7);return;}
      offset+=length+2;
    }
    assert.fail('Encoder did not write a JPEG frame');
  });
  assert.throws(()=>validateImage(changed),/16.000/);
});
test('WebP RIFF length and compressed-frame dimensions must be structurally valid',()=>{
  assert.throws(()=>validateImage(modify(raster('webp'),bytes=>bytes.writeUInt32LE(bytes.length+100,4))),ApiError);
});
