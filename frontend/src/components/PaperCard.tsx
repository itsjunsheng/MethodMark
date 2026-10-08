import { ArrowUpRight, Clock3, FileText } from 'lucide-react';
import type { Paper } from '../data';
import { ItemCard } from './ItemCard';
import type { ItemActions } from './ItemMenu';

export function PaperCard({ paper, onOpen, ...actions }: ItemActions & {
  paper: Paper; onOpen: () => void;
}) {
  return <ItemCard className="paper-card" title={paper.title} colour={paper.color} icon={FileText}
    subtitle={`${paper.level} / ${paper.subject.startsWith('Additional') ? 'A-Math' : 'E-Math'}`}
    kind="paper" archived={paper.is_archived} openLabel={'Open paper ' + paper.title} onOpen={onOpen} {...actions}>
    <span className="item-card-stats">
      <span><FileText size={14} />{paper.questions.length} questions</span>
      <span><Clock3 size={14} />{paper.duration} min</span>
    </span><ArrowUpRight size={17} />
  </ItemCard>;
}
