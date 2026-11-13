import * as yauzl from 'yauzl';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { SourceDocument } from '../../shared/document';
type Metadata = NonNullable<SourceDocument['metadata']>;

function decodeXml(value:string):string {
  const node=parseFragment(value);
  const text=(child:DefaultTreeAdapterMap['node']):string => child.nodeName==='#text'
    ? (child as DefaultTreeAdapterMap['textNode']).value : 'childNodes' in child ? child.childNodes.map(text).join('') : '';
  return node.childNodes.map(text).join('').trim();
}
export function docxMetadata(buffer:Buffer):Promise<Metadata> {
  return new Promise(resolve=>{
    yauzl.fromBuffer(buffer,{lazyEntries:true},(error,zip)=>{
      if(error||!zip){resolve({});return;}
      let finished=false;
      const done=(value:Metadata={})=>{if(finished)return;finished=true;zip.close();resolve(value);};
      zip.on('error',()=>done());zip.on('end',()=>done());
      zip.on('entry',entry=>{
        if(entry.fileName!=='docProps/core.xml'){zip.readEntry();return;}
        if(entry.uncompressedSize>64000){done();return;}
        zip.openReadStream(entry,(error,stream)=>{
          if(error||!stream){done();return;}
          const chunks:Buffer[]=[];let length=0;
          stream.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>64000){stream.destroy();done();return;}chunks.push(chunk);});
          stream.on('error',()=>done());stream.on('end',()=>{
            const xml=Buffer.concat(chunks).toString('utf8');const value:Metadata={};
            for(const [field,limit] of [['title',1000],['subject',2000],['creator',500]] as const){
              const match=new RegExp(`<dc:${field}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/dc:${field}>`,'u').exec(xml);
              if(match)value[field==='creator'?'author':field]=decodeXml(match[1]).slice(0,limit);
            }
            done(value);
          });
        });
      });zip.readEntry();
    });
  });
}
