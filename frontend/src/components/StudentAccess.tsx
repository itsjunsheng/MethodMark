import { useToast } from './Toast';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { getStudentAssignment, openStudentAssignment } from '../api/studentAssignments';
import { singaporeDate } from '../lib/assignmentStatus';
import { useRemoteData } from '../lib/useRemoteData';
import type { StudentAccess as Access } from '../types/assignments';
import { StudentPaper } from './StudentPaper';

export default function StudentAccess({ assignmentId }: { assignmentId: string }) {
  const load = useCallback((signal: AbortSignal) => getStudentAssignment(assignmentId, signal), [assignmentId]);
  const { data: assignment, loading, error: loadError, reload } = useRemoteData(load);
  const [access, setAccess] = useState<Access | null>(null);
  const [code, setCode] = useState('');
  const [opening, setOpening] = useState(false);
  const toast = useToast();

  async function openPaper(event: FormEvent) {
    event.preventDefault();
    if (opening) return;
    setOpening(true); toast.dismiss();
    try { setAccess(await openStudentAssignment(assignmentId, code)); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not open this paper. Try again.'); }
    finally { setOpening(false); }
  }
  return <div className="student-preview-page student-exam-page"><main>
    {loading ? <p className="student-welcome" role="status">Loading your assignment...</p>
      : loadError ? <section className="panel student-welcome"><h1>This assignment could not be opened.</h1>
        <button className="btn secondary" onClick={reload}>Try again</button></section>
        : access ? <StudentPaper key={assignmentId + ':' + access.student_code} token={assignmentId} access={access} />
          : assignment && <section className="panel student-welcome">
            <span className="soft-icon"><BookOpen size={28} /></span>
            <h1>{assignment.title}</h1>
            <p>{assignment.question_count} questions &middot; {assignment.duration} minutes</p>
            <p>Due {singaporeDate(assignment.due_at)}</p>
            {!assignment.accepting_submissions && <p className="class-help">Submissions are closed. You can still open the paper.</p>}
            <form onSubmit={openPaper}>
              <label>Your student code<input value={code} onChange={event => setCode(event.target.value)}
                placeholder="e.g. blue-otter" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={50} disabled={opening} /></label>
              <button type="submit" className="btn primary" disabled={opening}>{opening ? 'Opening...' : 'Open practice paper'}<ArrowRight size={16} /></button>
            </form>
            <p className="field-hint">Use the code your tutor gave you for this class. No account needed.</p>
          </section>}
  </main></div>;
}
