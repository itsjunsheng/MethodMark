import { useState } from 'react';
import { ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { retryGrading } from '../api/grading';
import type { QueueItem } from '../types/grading';
import { singaporeDate } from '../lib/assignmentStatus';
import { useToast } from './Toast';
import { GradingReview } from './GradingReview';
import './MarkingQueue.css';

export const gradingLabels = { queued: 'Queued', processing: 'Processing', awaiting_review: 'Awaiting review', failed: 'Processing failed' };

export function MarkingQueue({ data, loading, error, reload }: {
  data: QueueItem[] | null; loading: boolean; error: string; reload: () => void;
}) {
  const [filter, setFilter] = useState('Awaiting review');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const toast = useToast();
  const matches = (item: QueueItem, tab: string) => tab === 'All submissions'
    || (tab === 'Flagged' ? item.flagged && item.status === 'awaiting_review'
      : tab === 'Processing' ? ['queued', 'processing'].includes(item.status) : gradingLabels[item.status] === tab);
  const visible = (data ?? []).filter(item => matches(item, filter)
    && [item.student_name, item.student_code, item.class_name, item.paper_title].join(' ').toLowerCase().includes(query.toLowerCase()));
  async function retry(id: string) {
    setRetrying(id);
    try { await retryGrading(id); toast.success('Submission queued for grading.'); reload(); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not retry grading.'); }
    finally { setRetrying(null); }
  }
  return <section className="marking-queue" aria-label="Marking queue">
    <div className="info-banner"><ShieldCheck size={21} /><div><strong>Ready for your judgement.</strong>
      <p>Check the working, marks and feedback. Every assessment stays private while you review it.</p></div></div>
    <div className="panel">
      <div className="grading-tabs" role="group" aria-label="Filter marking queue">
        {['Awaiting review', 'Flagged', 'Processing', 'Processing failed', 'All submissions'].map(tab =>
          <button key={tab} aria-pressed={filter === tab} onClick={() => setFilter(tab)}>{tab}
            <span>{(data ?? []).filter(item => matches(item, tab)).length}</span></button>)}
      </div>
      <div className="grading-list-tools"><input aria-label="Search marking queue" placeholder="Search students, classes or papers" value={query} onChange={e => setQuery(e.target.value)} />
        <button className="btn secondary" disabled={loading} onClick={reload}><RefreshCw size={15} />Refresh</button></div>
      {error ? <div className="grading-empty"><p>Unable to load the marking queue.</p><button className="btn secondary" onClick={reload}>Try again</button></div>
        : !data && loading ? <p className="grading-empty" role="status">Loading submissions...</p>
          : !visible.length ? <div className="grading-empty"><ClipboardCheck size={28} /><h3>{data?.length ? 'No submissions in this view' : 'No submissions yet'}</h3>
            <p>{data?.length ? 'Choose another filter or search.' : 'Submitted work will be graded and appear here for your review.'}</p></div>
            : <ul className="grading-list">{visible.map(item => <li key={item.submission_id}>
              <div><strong>{item.student_name || item.student_code}</strong><small>{item.student_code} / {item.class_name}</small></div>
              <div><strong>{item.paper_title}</strong><small>Submitted {singaporeDate(item.submitted_at)}</small>
                {item.error && <p className="grading-error">{item.error}</p>}</div>
              <div><span className={'grading-status ' + item.status}>{gradingLabels[item.status]}</span>
                {item.flagged && <small className="grading-flag">Needs a closer look</small>}
                {item.review_saved_at && <small>Review draft saved</small>}</div>
              <div className="grading-row-actions">{item.status === 'failed' && <button className="btn secondary" disabled={retrying === item.submission_id} onClick={() => void retry(item.submission_id)}>{retrying === item.submission_id ? 'Queueing...' : 'Retry grading'}</button>}
                {['failed', 'awaiting_review'].includes(item.status) && <button className="btn secondary" onClick={() => setSelected(item)}>{item.status === 'failed' ? 'Review manually' : 'Review'}</button>}</div>
            </li>)}</ul>}
    </div>
    {selected && <GradingReview item={selected} onClose={() => { setSelected(null); reload(); }} onSaved={reload} />}
  </section>;
}
