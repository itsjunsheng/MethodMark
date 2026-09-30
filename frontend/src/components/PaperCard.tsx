import { ArrowUpRight, Clock3, FileText } from 'lucide-react';
import type { Paper } from '../data';
import { ItemCard } from './ItemCard';
import type { ItemActions } from './ItemMenu';

export function PaperCard({ paper, onOpen, ...actions }: ItemActions & {
  paper: Paper; onOpen: () => void;
}) {
  return <ItemCard className="paper-card" title={paper.title} colour={paper.color} icon={FileText}
    kind="paper" archived={paper.is_archived} openLabel={'Open paper ' + paper.title} onOpen={onOpen} {...actions}>
    <span className="paper-meta"><span>{paper.level} / {paper.subject.startsWith('Additional') ? 'A-Math' : 'E-Math'}</span>
      <span className={'badge ' + (paper.approved ? 'green' : 'gray')}><span className="badge-dot" />
        {paper.status === 'published' ? 'Published' : paper.approved ? 'Reviewed' : 'Draft'}
      </span>
    </span>
    <h3>{paper.title}</h3>
    <p>{paper.topics.join(' / ')}</p>
    <span className="paper-card-bottom">
      <span><FileText size={14} />{paper.questions.length} questions</span>
      <span><Clock3 size={14} />{paper.duration} min</span><ArrowUpRight size={17} />
    </span>
  </ItemCard>;
}
