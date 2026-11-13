import { CircleAlert, CircleCheck, ChevronRight } from 'lucide-react';
import type { ReviewIssue } from '../../shared/document';
export function IssueList({ issues, onSelect }: { issues: ReviewIssue[]; onSelect?: (id: string) => void }) {
  if (!issues.length) return <div className="dg-no-issues"><CircleCheck size={17} />Nenhum apontamento nesta verificação.</div>;
  return <ul className="dg-issue-list">{issues.map((issue, index) => <li key={`${issue.blockId}-${index}`}>
    <button type="button" className={`dg-issue dg-issue-${issue.severity}`} disabled={!issue.blockId || !onSelect}
      onClick={() => issue.blockId && onSelect?.(issue.blockId)}>
      <CircleAlert size={15} /><span>{issue.page ? `Página ${issue.page}: ` : ''}{issue.message}</span>
      {issue.blockId && onSelect && <ChevronRight size={14} />}
    </button></li>)}</ul>;
}
