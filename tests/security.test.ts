import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import express from 'express';
import { createApi } from '../server/api';
import { parseCapability, verifyCapabilitySignature } from '../server/auth';
import { validatedProject } from '../server/validation';
import { createProject, makeBlock } from '../shared/document';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const certificate=publicKey.export({type:'spki',format:'pem'}).toString();
function token(patch:Record<string,unknown>={}) {
  const iat=Math.floor(Date.now()/1000);
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({iss:'documents@idp-work.iam.gserviceaccount.com',
    aud:'diagrama-ai',scope:'documents:process',sub:'a'.repeat(64),iat,exp:iat+300,
    origin:'https://diagrama-crasp.ai.studio',...patch})).toString('base64url');
  const data=`${header}.${payload}`;
  return `${data}.${createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url')}`;
}
test('capability is scoped to idp-work project, audience, origin and five-minute window',()=>{
  assert.doesNotThrow(()=>parseCapability(token(),'https://diagrama-crasp.ai.studio'));
  for(const change of [{aud:'apresenta'},{scope:'admin'},{iss:'documents@other.iam.gserviceaccount.com'},
    {exp:1},{iat:Math.floor(Date.now()/1000)+1000},{exp:Math.floor(Date.now()/1000)+3600}])
    assert.throws(()=>parseCapability(token(change)));
  assert.throws(()=>parseCapability(token(),'https://elsewhere.example'));
});
test('RS256 signature verifies actual signed bytes and rejects altered payload',()=>{
  const parsed=parseCapability(token());
  assert.equal(verifyCapabilitySignature(parsed.data,parsed.signature,[certificate]),true);
  assert.equal(verifyCapabilitySignature(`${parsed.data}changed`,parsed.signature,[certificate]),false);
});
test('project rejects external image links and repeated block IDs',()=>{
  const project=createProject();const block=makeBlock('image');block.image='https://example.com/image.png';
  project.blocks=[block];assert.throws(()=>validatedProject(project));
  block.image='';project.blocks=[block,{...block}];assert.throws(()=>validatedProject(project));
});
test('real HTTP backend starts without OpenAI secrets and rejects all processing without Work authorization',async()=>{
  const app=express();app.use('/api',createApi());
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  try {
    const status=await fetch(base+'/api/status');assert.equal(status.status,200);
    const body=await status.json();assert.equal(typeof body.data.configured,'boolean');
    for(const path of ['import','generate','review','export/pdf','export/docx']){
      const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      assert.equal(response.status,401);assert.match((await response.json()).error,/Work/);
    }
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
