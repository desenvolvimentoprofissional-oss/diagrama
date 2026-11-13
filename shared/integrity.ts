import type { DocumentBlock, DocumentProject, ReviewIssue } from './document';

export function blockText(block: DocumentBlock): string {
  if (block.kind === 'table') return block.rows.flat().join('\n');
  if (block.kind === 'cards' || block.kind === 'steps') {
    return [block.text, ...block.items.flatMap(item => [item.title, item.text])].filter(Boolean).join('\n');
  }
  return [block.text, block.caption].filter(Boolean).join('\n');
}

function sameOriginal(output: DocumentBlock, original: DocumentBlock): boolean {
  const textKinds = ['heading','paragraph','list','callout'];
  const equivalentKind = output.kind === original.kind
    || (textKinds.includes(output.kind) && textKinds.includes(original.kind))
    || (['cards','steps'].includes(output.kind) && ['cards','steps'].includes(original.kind));
  return equivalentKind && output.text === original.text && JSON.stringify(output.rows) === JSON.stringify(original.rows)
    && output.image === original.image && output.caption === original.caption
    && JSON.stringify(output.items) === JSON.stringify(original.items);
}

export function auditProject(project: DocumentProject): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const source = project.source?.blocks || [];
  const sourceMap = new Map(source.map(block => [block.id, block]));
  const seen = new Map<string, number>();
  const ids = new Set<string>();
  const order: string[] = [];
  for (const block of project.blocks) {
    if (ids.has(block.id)) issues.push({ severity: 'error', blockId: block.id, message: 'Há identificadores de bloco duplicados.' });
    ids.add(block.id);
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
    else if (count > 1) issues.push({ severity: project.mode === 'integral' ? 'error' : 'warning', blockId: original.id,
      message: 'O mesmo trecho da origem foi utilizado em mais de um bloco.' });
  }
  if (project.mode === 'integral' && order.some((id, index) => source[index]?.id !== id)) {
    issues.push({ severity: 'error', message: 'A sequência do documento integral difere da origem.' });
  }
  if (project.mode === 'explanatory' && source.length) {
    const cited = (text: string) => Array.from(text.matchAll(/\bart(?:igo)?s?\.?\s*(\d+)[º°]?/gi), match => match[1]);
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
