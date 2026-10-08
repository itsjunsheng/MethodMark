import { useState } from 'react';
import { ClipboardCheck, RefreshCw, Send } from 'lucide-react';
import { retryGrading, sendClassForGrading } from '../api/grading';
import type { QueueItem } from '../types/grading';
import { singaporeDate } from '../lib/assignmentStatus';
import { needsReview, readyToRelease, reviewState } from '../lib/reviewState';
import { useToast } from './Toast';
import { GradingReview } from './GradingReview';
import './MarkingQueue.css';

const tabs = ['All submissions', 'Awaiting review', 'Flagged', 'Ready to release', 'Released'] as const;
type QueueTab = typeof tabs[number];

function matchesTab(item: QueueItem, tab: QueueTab) {
  switch (tab) {
    case 'All submissions': return true;
    case 'Awaiting review': return needsReview(item);
    case 'Flagged': return item.flagged && needsReview(item);
    case 'Ready to release': return readyToRelease(item);
    case 'Released': return item.status === 'released';
  }
}

export function MarkingQueue({ data, loading, error, reload }: {
  data: QueueItem[] | null; loading: boolean; error: string; reload: () => void;
}) {
  const [filter, setFilter] = useState<QueueTab>('All submissions');
  const [classId, setClassId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const toast = useToast();
  const classes = Array.from(new Map((data ?? []).map(item => [item.class_id, item.class_name])),
    ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const classItems = (data ?? []).filter(item => !classId || item.class_id === classId);
  const hasPendingSubmissions = classItems.some(item => item.status === 'submitted');
  const search = query.trim().toLowerCase();
  const visible = classItems.filter(item => matchesTab(item, filter)
    && [item.student_name, item.student_code, item.class_name, item.paper_title].join(' ').toLowerCase().includes(search));
  async function send() {
    if (!classId) {
      toast.info('Please select a class before sending submissions for grading.');
      return;
    }
    setSending(classId);
    try {
      const result = await sendClassForGrading(classId);
      toast.success(result.queued ? `${result.queued} submission${result.queued === 1 ? '' : 's'} queued for grading.` : 'No new submissions to send.');
      reload();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not send this class for grading.'); }
    finally { setSending(null); }
  }
  async function retry(id: string) {
    setRetrying(id);
    try { await retryGrading(id); toast.success('Submission queued for grading.'); reload(); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not retry grading.'); }
    finally { setRetrying(null); }
  }
  return <section className="marking-queue" aria-label="Marking queue">
    <div className="panel">
      <div className="grading-tabs" role="group" aria-label="Filter marking queue">
        {tabs.map(tab =>
          <button key={tab} aria-pressed={filter === tab} onClick={() => setFilter(tab)}>{tab}
            <span>{classItems.filter(item => matchesTab(item, tab)).length}</span></button>)}
      </div>
      <div className="grading-list-tools"><input aria-label="Search marking queue" placeholder="Search students, classes or papers" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Filter by class" value={classId} onChange={e => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="grading-list-actions">
          <button className="btn secondary" disabled={loading} onClick={reload}><RefreshCw size={15} />Refresh</button>
          <button className="btn primary" disabled={!!sending || loading || !!error || (!!classId && !hasPendingSubmissions)}
            title={classId ? 'Send all new submissions in the selected class, including those hidden by search' : 'Select a class to send its submissions for grading'}
            onClick={() => void send()}><Send size={15} />{sending ? 'Sending...' : 'Send for grading'}</button>
        </div>
      </div>
      {error ? <div className="grading-empty"><p>Unable to load the marking queue.</p><button className="btn secondary" onClick={reload}>Try again</button></div>
        : !data && loading ? <p className="grading-empty" role="status">Loading submissions...</p>
          : !visible.length ? <div className="grading-empty"><ClipboardCheck size={28} /><h3>{data?.length ? 'No submissions in this view' : 'No submissions yet'}</h3>
            <p>{data?.length ? 'Choose another filter or search.' : 'Student submissions will appear here. Send a class for grading when you are ready.'}</p></div>
            : <ul className="grading-list">{visible.map(item => <SubmissionRow key={item.submission_id}
              item={item} retrying={retrying} onRetry={retry} onReview={setSelected} />)}</ul>}
    </div>
    {selected && <GradingReview item={selected} onClose={() => { setSelected(null); reload(); }} onSaved={reload} />}
  </section>;
}

function SubmissionRow({ item, retrying, onRetry, onReview }: {
  item: QueueItem; retrying: string | null; onRetry: (id: string) => Promise<void>; onReview: (item: QueueItem) => void;
}) {
  const state = reviewState(item);
  return <li>
    <div><strong>{item.student_name || item.student_code}</strong><small>{item.student_code} / {item.class_name}</small></div>
    <div><strong>{item.paper_title}</strong><small>Submitted {singaporeDate(item.submitted_at)}</small></div>
    <div className="grading-row-result">
      <span className={'grading-status ' + state.key}>{state.label}</span>
      {item.flagged && !item.review_complete && <small className="grading-flag">Needs a closer look</small>}
      {item.error && <p className="grading-error">{item.error}</p>}
      <div className="grading-row-actions">
        {item.status === 'failed' && <button className="btn secondary" disabled={!!retrying} onClick={() => void onRetry(item.submission_id)}>
          {retrying === item.submission_id ? 'Queueing...' : 'Retry grading'}</button>}
        {['failed', 'awaiting_review', 'released'].includes(item.status) && <button className="btn secondary" onClick={() => onReview(item)}>
          {item.status === 'failed' ? 'Review manually' : item.status === 'released' ? 'View result' : 'Review'}</button>}
      </div>
    </div>
  </li>;
}
