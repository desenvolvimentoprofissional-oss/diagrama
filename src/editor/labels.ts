import { AlignLeft, Heading, List, Table2, Image, MessageSquare, Columns3, Workflow, GitBranch } from 'lucide-react';
import type { DocumentBlock } from '../../shared/document';
export const blockLabels: Record<DocumentBlock['kind'], string> = {
  heading: 'Título', paragraph: 'Texto', list: 'Item de lista', table: 'Tabela',
  image: 'Imagem', callout: 'Destaque', cards: 'Cards', steps: 'Fluxo', diagram: 'Infográfico',
};
export const blockIcons = {
  heading: Heading, paragraph: AlignLeft, list: List, table: Table2,
  image: Image, callout: MessageSquare, cards: Columns3, steps: Workflow, diagram: GitBranch,
};
export function blockSummary(block: DocumentBlock) {
  return block.text || block.nodes?.map(node => node.label).join(' · ') || block.caption || block.items.map(item => item.title || item.text).join(' · ')
    || block.rows[0]?.join(' · ') || blockLabels[block.kind];
}
