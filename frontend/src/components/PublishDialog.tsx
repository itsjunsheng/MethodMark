import { useToast } from './Toast';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import type { Paper } from '../data';
import { listClasses } from '../api/classes';
import { listAssignments, publishAssignments } from '../api/assignments';
import { defaultDeadline } from '../lib/assignmentStatus';
import { useRemoteData } from '../lib/useRemoteData';
import { Modal } from './Modal';
import { ClassSelect } from './ClassSelect';
import './Assignments.css';

export function PublishDialog({ paper, onClose, onPublished }: {
  paper: Paper; onClose: () => void; onPublished: () => void;
}) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [classes, assignments] = await Promise.all([listClasses(signal), listAssignments(signal)]);
    return { classes, assigned: assignments.filter(item => item.paper_id === paper.id).map(item => item.class_id) };
  }, [paper.id]);
  const { data, loading, error: loadError, reload } = useRemoteData(load);
  const classes = data?.classes;
  const assigned = data?.assigned ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [due, setDue] = useState(defaultDeadline);
  const [publishing, setPublishing] = useState(false);
  const toast = useToast();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (publishing || !selected.length || !paper.approved) return;
    const deadline = new Date(due + ':00+08:00');
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      toast.error('Choose a future submission deadline.'); return;
    }
    setPublishing(true); toast.dismiss();
    try { await publishAssignments(paper.id, selected, deadline.toISOString()); onPublished(); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not publish the assignment.'); }
    finally { setPublishing(false); }
  }

  return <Modal title="Assign to your classes" subtitle={paper.title} className="class-dialog"
    onClose={() => { if (!publishing) onClose(); }}>
    <form className="modal-body assignment-publish" onSubmit={submit}>
      {loading ? <p role="status">Loading classes...</p> : loadError ? <div><p>Unable to load your classes.</p><button type="button" className="btn secondary" onClick={reload}>Try again</button></div>
        : !classes?.length ? <p>Create a class in Classes &amp; students before publishing.</p>
          : <fieldset disabled={publishing}>
            <ClassSelect classes={classes} assigned={assigned} selected={selected} disabled={publishing} onChange={setSelected} />
            <label>Submission deadline (Singapore time)<input type="datetime-local" value={due} required onChange={event => setDue(event.target.value)} /></label>
            {classes.every(item => assigned.includes(item.id)) && <p className="class-help">This paper is already assigned to all your classes.</p>}
            <p className="class-help">Each class gets its own student link. Submissions close at the deadline.</p>
          </fieldset>}
      <div className="modal-actions"><button type="button" className="btn secondary" disabled={publishing} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={loading || !!loadError || !selected.length || publishing}>
          {publishing ? 'Publishing...' : 'Publish assignment'}
        </button></div>
    </form>
  </Modal>;
}
