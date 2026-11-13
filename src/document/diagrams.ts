import type { DocumentBlock } from '../../shared/document';

/** Self-contained so the PDF renderer and the editor execute the identical vector composition. */
export function renderDiagram(parent:HTMLElement, block:DocumentBlock):HTMLElement {
  const doc=parent.ownerDocument;
  const figure=doc.createElement('figure');figure.className='dg-diagram';
  figure.dataset.blockId=block.id;figure.dataset.fragmentKind='diagram';figure.dataset.layout=block.layout||'process';
  const canvas=doc.createElement('div');canvas.className='dg-diagram-canvas';figure.append(canvas);parent.append(figure);
  const nodes=block.nodes||[];const edges=block.edges||[];
  const areaWidth=Math.max(400,parent.offsetWidth-38);
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const incoming=new Map(nodes.map(node=>[node.id,0]));
  const ranks=new Map(nodes.map(node=>[node.id,0]));
  for(const edge of edges)if(byId.has(edge.from)&&byId.has(edge.to))incoming.set(edge.to,incoming.get(edge.to)!+1);
  const queue=nodes.filter(node=>!incoming.get(node.id)).map(node=>node.id);let visited=0;
  while(queue.length){
    const id=queue.shift()!;visited++;
    for(const edge of edges.filter(edge=>edge.from===id&&byId.has(edge.to))){
      ranks.set(edge.to,Math.max(ranks.get(edge.to)!,ranks.get(id)!+1));
      incoming.set(edge.to,incoming.get(edge.to)!-1);if(!incoming.get(edge.to))queue.push(edge.to);
    }
  }
  const sequential=edges.length===Math.max(0,nodes.length-1)&&edges.every((edge,index)=>edge.from===nodes[index]?.id&&edge.to===nodes[index+1]?.id);
  if(!edges.length||visited!==nodes.length)nodes.forEach((node,index)=>ranks.set(node.id,index));
  const folded=sequential&&nodes.length>9;
  const wideGutter=edges.some(edge=>edge.label&&Math.abs((ranks.get(edge.to)||0)-(ranks.get(edge.from)||0))>1);
  const gutter=wideGutter?90:18;const width=areaWidth-(gutter-18);const canvasWidth=areaWidth+18;
  const positions=new Map<string,{x:number;y:number;width:number;height:number}>();
  const elements=new Map<string,HTMLElement>();
  const levels=new Map<number,string[]>();
  nodes.forEach((node,index)=>{
    const level=folded?Math.floor(index/2):ranks.get(node.id)!;
    const row=levels.get(level)||[];row.push(node.id);levels.set(level,row);
  });
  const gap=22;const rowGap=edges.some(edge=>edge.label&&Math.abs((ranks.get(edge.to)||0)-(ranks.get(edge.from)||0))<=1)?34:22;let y=0;
  for(const [rank,ids] of [...levels].sort((a,b)=>a[0]-b[0])){
    const columns=Math.min(3,ids.length);const nodeWidth=(width-(columns-1)*gap)/columns;
    for(let offset=0;offset<ids.length;offset+=columns){
      const group=ids.slice(offset,offset+columns);let rowHeight=0;
      const order=folded&&rank%2?[...group].reverse():group;
      for(let index=0;index<order.length;index++){
        const id=order[index];const model=byId.get(id)!;
        const card=doc.createElement('div');card.className='dg-diagram-node';card.dataset.nodeId=id;
        const number=doc.createElement('span');number.className='dg-diagram-number';number.textContent=String(nodes.indexOf(model)+1);
        const content=doc.createElement('div');content.className='dg-diagram-node-content';
        const label=doc.createElement('div');label.className='dg-diagram-label';label.textContent=model.label;
        const detail=doc.createElement('div');detail.className='dg-diagram-detail';detail.textContent=model.detail;
        content.append(label);if(model.detail)content.append(detail);card.append(number,content);
        const x=group.length<columns?(width-nodeWidth*group.length-gap*(group.length-1))/2+index*(nodeWidth+gap):index*(nodeWidth+gap);
        card.style.cssText=`width:${nodeWidth}px;left:${x}px;top:${y}px`;canvas.append(card);
        const height=card.offsetHeight;rowHeight=Math.max(rowHeight,height);positions.set(id,{x,y,width:nodeWidth,height});elements.set(id,card);
      }
      for(const id of group){const position=positions.get(id)!;position.height=rowHeight;elements.get(id)!.style.minHeight=`${rowHeight}px`;}
      y+=rowHeight+rowGap;
    }
  }
  const height=Math.max(0,y-rowGap);canvas.style.height=`${height}px`;canvas.style.width=`${canvasWidth}px`;
  const namespace='http://www.w3.org/2000/svg';const svg=doc.createElementNS(namespace,'svg');
  svg.classList.add('dg-diagram-connections');svg.setAttribute('viewBox',`0 0 ${canvasWidth} ${height}`);
  svg.setAttribute('width',String(canvasWidth));svg.setAttribute('height',String(height));svg.setAttribute('aria-label','Relações entre as etapas');
  const defs=doc.createElementNS(namespace,'defs');const marker=doc.createElementNS(namespace,'marker');
  const markerId=`dg-arrow-${Array.from(block.id).map(char=>char.codePointAt(0)!.toString(16)).join('-')}`;
  marker.setAttribute('id',markerId);marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');marker.setAttribute('orient','auto-start-reverse');
  const arrow=doc.createElementNS(namespace,'path');arrow.setAttribute('d','M 1 1 L 9 5 L 1 9');arrow.setAttribute('fill','none');arrow.setAttribute('stroke','currentColor');arrow.setAttribute('stroke-width','1.5');marker.append(arrow);defs.append(marker);svg.append(defs);
  for(const edge of edges){
    const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to)continue;
    const path=doc.createElementNS(namespace,'path');let d='';let labelX=0,labelY=0;let outside=false;
    const delta=to.y-(from.y+from.height);
    if(delta>=0&&delta<rowGap*1.5){
      const startX=from.x+from.width/2,endX=to.x+to.width/2;const midY=from.y+from.height+delta/2;
      d=`M ${startX} ${from.y+from.height} V ${midY} H ${endX} V ${to.y}`;labelX=(startX+endX)/2;labelY=midY;
    }else if(Math.abs(to.y-from.y)<2){
      const right=to.x>from.x;const startX=right?from.x+from.width:from.x;const endX=right?to.x:to.x+to.width;
      labelY=from.y+from.height/2;labelX=(startX+endX)/2;d=`M ${startX} ${labelY} H ${endX}`;
    }else{
      outside=true;const channel=width+gutter-9;const startY=from.y+from.height/2,endY=to.y+to.height/2;
      d=`M ${from.x+from.width} ${startY} H ${channel} V ${endY} H ${to.x+to.width}`;labelX=width+gutter/2;labelY=(startY+endY)/2;
    }
    path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.5');path.setAttribute('marker-end',`url(#${markerId})`);
    const title=doc.createElementNS(namespace,'title');title.textContent=`${byId.get(edge.from)!.label} → ${byId.get(edge.to)!.label}${edge.label?`: ${edge.label}`:''}`;path.append(title);svg.append(path);
    if(edge.label){const label=doc.createElement('div');label.className='dg-edge-label';label.textContent=edge.label;
      if(outside&&wideGutter)label.style.maxWidth=`${gutter-14}px`;
      label.style.left=`${Math.max(38,Math.min(areaWidth-30,labelX))}px`;label.style.top=`${labelY}px`;canvas.append(label);}
  }
  canvas.prepend(svg);
  if(!nodes.length){const empty=doc.createElement('p');empty.textContent='O diagrama precisa de etapas ou elementos.';canvas.append(empty);}
  figure.dataset.nodeCount=String(nodes.length);figure.dataset.edgeCount=String(edges.length);
  return figure;
}
