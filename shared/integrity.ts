import type { DocumentBlock, DocumentProject, ReviewIssue } from './document';

export function blockText(block: DocumentBlock): string {
  const parts=[block.text,block.caption];
  if(block.kind==='table')parts.push(...block.rows.flat());
  if(block.kind==='cards'||block.kind==='steps')parts.push(...block.items.flatMap(item=>[item.title,item.text]));
  if(block.kind==='diagram')parts.push(...(block.nodes||[]).flatMap(node=>[node.label,node.detail]),
    ...(block.edges||[]).map(edge=>edge.label));
  return parts.filter(Boolean).join('\n');
}
export function graphIssues(block:DocumentBlock,requireSource=true):string[] {
  if(block.kind!=='diagram')return block.nodes?.length||block.edges?.length?['Há relações em um componente que não as exibe.']:[];
  const nodes=block.nodes||[];const edges=block.edges||[];
  const ids=new Set(nodes.map(node=>node.id));const issues:string[]=[];
  if(nodes.length<2||!edges.length)issues.push('O diagrama precisa de pelo menos dois nós e uma relação.');
  if(ids.size!==nodes.length)issues.push('O diagrama contém identificadores de nó repetidos.');
  if(nodes.some(node=>!node.label.trim()||(requireSource&&!node.sourceIds.length)||node.sourceIds.some(id=>!block.sourceIds.includes(id))))
    issues.push('Um nó do diagrama não possui título e referência de origem válidos.');
  if(edges.some(edge=>!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to))
    issues.push('O diagrama contém relação inexistente ou autorreferente.');
  if(nodes.some(node=>!edges.some(edge=>edge.from===node.id||edge.to===node.id)))
    issues.push('O diagrama contém um nó isolado.');
  const degree=new Map(nodes.map(node=>[node.id,0]));
  for(const edge of edges)if(degree.has(edge.to))degree.set(edge.to,degree.get(edge.to)!+1);
  const queue=[...degree].filter(([,count])=>!count).map(([id])=>id);let visited=0;
  while(queue.length){const id=queue.shift()!;visited++;for(const edge of edges.filter(edge=>edge.from===id)){
    const count=(degree.get(edge.to)||0)-1;degree.set(edge.to,count);if(!count)queue.push(edge.to);
  }}
  if(visited!==nodes.length)issues.push('O diagrama contém ciclo ou ordem de relações inválida.');
  return issues;
}

function sameOriginal(output: DocumentBlock, original: DocumentBlock): boolean {
  const textKinds = ['heading','paragraph','list','callout'];
  const equivalentKind = output.kind === original.kind
    || (textKinds.includes(output.kind) && textKinds.includes(original.kind))
    || (['cards','steps'].includes(output.kind) && ['cards','steps'].includes(original.kind));
  return equivalentKind && output.text === original.text && JSON.stringify(output.rows) === JSON.stringify(original.rows)
    && output.image === original.image && output.caption === original.caption
    && JSON.stringify(output.items) === JSON.stringify(original.items)
    && JSON.stringify(output.nodes||[]) === JSON.stringify(original.nodes||[])
    && JSON.stringify(output.edges||[]) === JSON.stringify(original.edges||[]);
}


export function citedArticleNumbers(text:string):string[] {
  const numbers=new Set<string>();
  const expression=/\bart(?:igo)?s?\.?\s*(\d{1,4})[º°]?((?:\s*(?:,|e|a|ao|até|–|-)\s*\d{1,4}[º°]?){0,20})/gi;
  for(const citation of text.matchAll(expression)) {
    let previous=Number(citation[1]);numbers.add(String(previous));
    for(const item of citation[2].matchAll(/(,|e|ao|até|a|–|-)\s*(\d{1,4})/gi)) {
      const next=Number(item[2]);
      if(/^(?:a|ao|até|–|-)$/i.test(item[1])&&next>=previous&&next-previous<=200)
        for(let value=previous;value<=next;value++)numbers.add(String(value));
      else numbers.add(String(next));
      previous=next;
    }
  }
  return [...numbers];
}

export function auditProject(project: DocumentProject): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const source = project.source?.blocks || [];
  const sourceMap = new Map(source.map(block => [block.id, block]));
  const seen = new Map<string, number>();
  const ids = new Set<string>();
  const order: string[] = [];
  const contentSeen=new Map<string,string>();
  for (const block of project.blocks) {
    if (ids.has(block.id)) issues.push({ severity: 'error', blockId: block.id, message: 'Há identificadores de bloco duplicados.' });
    ids.add(block.id);
    for(const message of graphIssues(block,source.length>0))issues.push({severity:'error',blockId:block.id,message});
    if((block.kind!=='table'&&block.rows.length)||(!['cards','steps'].includes(block.kind)&&block.items.length))
      issues.push({severity:'error',blockId:block.id,message:'Um componente contém dados que seu tipo não exibe.'});
    if(project.mode==='explanatory'){
      const text=blockText(block).replace(/\s+/g,' ').trim();
      if(text.length>100&&contentSeen.has(text))issues.push({severity:'warning',blockId:block.id,
        message:'O mesmo conteúdo foi repetido integralmente em outro componente.'});
      else if(text)contentSeen.set(text,block.id);
    }
    if (!block.sourceIds.length && source.length) {
      issues.push({ severity: project.mode === 'integral' ? 'error' : 'warning', blockId: block.id,
        message: 'Este bloco não tem referência ao documento de origem.' });
    }
    for (const id of block.sourceIds) {
      if (!sourceMap.has(id)) issues.push({ severity: 'error', blockId: block.id, message: 'A referência de origem deste bloco não existe.' });
      seen.set(id, (seen.get(id) || 0) + 1);
      order.push(id);
    }
    if (project.mode !== 'integral' || !block.sourceIds.length) continue;
    const originals = block.sourceIds.map(id => sourceMap.get(id)).filter(Boolean) as DocumentBlock[];
    let identical = originals.length === 1 && sameOriginal(block, originals[0]);
    if ((block.kind === 'cards' || block.kind === 'steps') && originals.length > 1) {
      identical = block.text === '' && block.caption === '' && block.image === '' && block.rows.length === 0
        && block.items.length === originals.length && originals.every((original, i) =>
          ['paragraph', 'list'].includes(original.kind) && block.items[i].title === ''
          && block.items[i].text === original.text && !original.caption && !original.image
          && original.rows.length === 0 && original.items.length === 0);
    }
    if (!identical) issues.push({ severity: 'error', blockId: block.id,
      message: 'O conteúdo foi alterado em relação à origem no modo integral.' });
  }
  for (const original of source) {
    const count = seen.get(original.id) || 0;
    if (!count) issues.push({ severity: 'error', blockId: original.id, message: 'Um trecho da origem não foi incluído no documento.' });
    else if (count > 1 && project.mode === 'integral') issues.push({ severity: 'error', blockId: original.id,
      message: 'O mesmo trecho da origem foi utilizado em mais de um bloco.' });
  }
  if (project.mode === 'integral' && order.some((id, index) => source[index]?.id !== id)) {
    issues.push({ severity: 'error', message: 'A sequência do documento integral difere da origem.' });
  }
  if (project.mode === 'explanatory' && source.length) {
    const cited = citedArticleNumbers;
    const knownArticles = new Set(source.flatMap(block => cited(blockText(block))));
    for (const block of project.blocks) {
      const unknown = cited(blockText(block)).filter(number => !knownArticles.has(number));
      if (unknown.length) issues.push({severity:'error',blockId:block.id,
        message:`Há referência a artigo não encontrado na origem: ${[...new Set(unknown)].join(', ')}.`});
    }
  }
  for (const message of new Set(project.source?.warnings || [])) {
    issues.push({severity:'warning',message});
  }
  if (project.source?.ocr) issues.push({ severity: 'warning', message:
    'A origem foi reconhecida por OCR. Confira nomes, números, tabelas e pontuação no arquivo original.' });
  if (project.mode === 'explanatory') issues.push({ severity: 'info', message:
    'A versão explicativa contém redação gerada. A cobertura das referências não substitui a conferência editorial do significado.' });
  return issues;
}
