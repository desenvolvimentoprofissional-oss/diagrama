import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {blockSchema,type DocumentBlock} from '../../shared/document';
import {AIError} from './client';
const integral=z.object({groups:z.array(z.object({sourceIds:z.array(z.string()).min(1).max(8),
  kind:z.enum(['source','callout','cards','steps']),breakBefore:z.boolean(),
}).strict()).max(6000)}).strict();
const explanation=z.object({blocks:z.array(blockSchema.omit({id:true,image:true,sourcePage:true})).min(1).max(6000)}).strict();
export function applyIntegralPlan(raw:unknown,originals:DocumentBlock[]):DocumentBlock[] {
  const parsed=integral.safeParse(raw);
  if(!parsed.success)throw new AIError('O plano de diagramação retornou uma estrutura inválida.',502,'invalid_plan');
  const order=parsed.data.groups.flatMap(group=>group.sourceIds);
  if(order.length!==originals.length||order.some((id,index)=>originals[index].id!==id))
    throw new AIError('O plano não preservou todos os trechos na sequência original. Nenhuma alteração foi aplicada.',502,'source_coverage');
  const known=new Map(originals.map(block=>[block.id,block]));
  return parsed.data.groups.map(group=>{
    const content=group.sourceIds.map(id=>known.get(id)!);const first=content[0];
    if(group.kind==='source'||group.kind==='callout'){
      if(content.length!==1||(group.kind==='callout'&&!['paragraph','list'].includes(first.kind)))
        throw new AIError('O plano propôs uma combinação incompatível com o modo integral.',502,'invalid_group');
      return {...first,id:randomUUID(),sourceIds:[first.id],breakBefore:group.breakBefore,
        kind:group.kind==='callout'?'callout' as const:first.kind};
    }
    if(content.length<2||content.some(block=>!['paragraph','list'].includes(block.kind)||block.caption||block.image||block.rows.length||block.items.length))
      throw new AIError('O infográfico proposto alteraria a estrutura da origem.',502,'invalid_infographic');
    return blockSchema.parse({id:randomUUID(),kind:group.kind,sourceIds:group.sourceIds,
      items:content.map(block=>({title:'',text:block.text})),breakBefore:group.breakBefore});
  });
}
export function validateGraph(block:DocumentBlock):void {
  if(block.kind!=='diagram'){
    if(block.nodes?.length||block.edges?.length)
      throw new AIError('Um componente contém relações que não seriam exibidas.',502,'hidden_graph');
    return;
  }
  const nodes=block.nodes||[];const edges=block.edges||[];
  const ids=new Set(nodes.map(node=>node.id));
  if(nodes.length<2||!edges.length||ids.size!==nodes.length||nodes.some(node=>!node.label.trim()||!node.sourceIds.length||node.sourceIds.some(id=>!block.sourceIds.includes(id))))
    throw new AIError('Um diagrama não possui nós únicos e fundamentados na origem.',502,'graph_nodes');
  if(edges.some(edge=>!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to))
    throw new AIError('Um diagrama contém uma ligação inválida.',502,'graph_edges');
  const degrees=new Map(nodes.map(node=>[node.id,0]));
  edges.forEach(edge=>degrees.set(edge.to,degrees.get(edge.to)!+1));
  const queue=[...degrees].filter(([,count])=>!count).map(([id])=>id);let visited=0;
  while(queue.length){const id=queue.shift()!;visited++;for(const edge of edges.filter(edge=>edge.from===id)){
    const count=degrees.get(edge.to)!-1;degrees.set(edge.to,count);if(!count)queue.push(edge.to);
  }}
  if(visited!==nodes.length)throw new AIError('Um diagrama contém ciclo que não pode ser composto com segurança.',502,'graph_cycle');
  if(nodes.some(node=>!edges.some(edge=>edge.from===node.id||edge.to===node.id)))
    throw new AIError('Um diagrama contém nó sem relação com os demais.',502,'graph_orphan');
}
export function applyExplanation(raw:unknown,originals:DocumentBlock[],required=originals):DocumentBlock[] {
  const parsed=explanation.safeParse(raw);
  if(!parsed.success)throw new AIError('A versão explicativa retornou uma estrutura inválida.',502,'invalid_explanation');
  const known=new Map(originals.map(block=>[block.id,block]));const covered=new Set<string>();
  const blocks=parsed.data.blocks.map(block=>{
    if(!block.sourceIds.length||block.sourceIds.some(id=>!known.has(id)))
      throw new AIError('Um trecho explicativo não tem referência válida à origem.',502,'unknown_source');
    block.sourceIds.forEach(id=>covered.add(id));
    const images=block.sourceIds.map(id=>known.get(id)!).filter(source=>source.kind==='image');
    if(block.kind==='image'&&(!images[0]?.image||images.length!==1))
      throw new AIError('A versão explicativa propôs uma imagem que não existe na origem.',502,'unknown_image');
    const tables=block.sourceIds.map(id=>known.get(id)!).filter(source=>source.kind==='table');
    if(block.kind==='table'&&tables.length>1)throw new AIError('Tabelas originais devem ser preservadas individualmente.',502,'merged_tables');
    const result=blockSchema.parse({...block,id:randomUUID(),image:block.kind==='image'?images[0].image:'',
      rows:block.kind==='table'&&tables.length===1?tables[0].rows:block.rows});
    if((result.kind!=='table'&&result.rows.length)||(!['cards','steps'].includes(result.kind)&&result.items.length))
      throw new AIError('Um componente contém conteúdo que não seria exibido.',502,'hidden_content');
    validateGraph(result);return result;
  });
  if(required.some(block=>!covered.has(block.id)))
    throw new AIError('A versão explicativa deixou trechos da origem sem cobertura. Nenhuma alteração foi aplicada.',502,'source_coverage');
  for(const original of required){
    if(!['image','table'].includes(original.kind))continue;
    const retained=blocks.some(block=>block.sourceIds.includes(original.id)&&block.kind===original.kind
      &&(original.kind==='image'?block.image===original.image:JSON.stringify(block.rows)===JSON.stringify(original.rows)));
    if(!retained)throw new AIError('Uma imagem ou tabela da origem não foi preservada na versão explicativa.',502,'asset_coverage');
  }
  return blocks;
}
