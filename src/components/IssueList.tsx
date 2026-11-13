import { CircleAlert, Info, ChevronRight } from 'lucide-react';
import type { ReviewIssue } from '../../shared/document';
export function IssueList({ issues, onSelect }: { issues: ReviewIssue[]; onSelect?: (id: string) => void }) {
  if (!issues.length) return <div className="dg-no-issues"><Info size={17} />Nenhum apontamento registrado.</div>;
  return <ul className="dg-issue-list">{issues.map((issue, index) => <li key={`${issue.blockId}-${index}`}>
    <button type="button" className={`dg-issue dg-issue-${issue.severity}`} disabled={!issue.blockId || !onSelect}
      onClick={() => issue.blockId && onSelect?.(issue.blockId)}>
      <CircleAlert size={15} /><span>{issue.page ? `Página ${issue.page}: ` : ''}{issue.message}</span>
      {issue.blockId && onSelect && <ChevronRight size={14} />}
    </button></li>)}</ul>;
}
