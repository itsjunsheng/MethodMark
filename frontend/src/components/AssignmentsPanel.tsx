import { useToast } from './Toast';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Copy, FileText, RefreshCw } from 'lucide-react';
import { getAttachmentUrls, getPaper, getSubmission, listAssignments, listSubmissions } from '../api/assignments';
import { listClassStudents } from '../api/classes';
import type { ClassAssignment, SubmissionSummary } from '../types/assignments';
import { assignmentLink, assignmentStatus, singaporeDate } from '../lib/assignmentStatus';
import { useRemoteData } from '../lib/useRemoteData';
import { ExamPaper } from './ExamPaper';
import { Modal } from './Modal';
import './Assignments.css';

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}

export function AssignmentsPanel({ classId, compact = false }: { classId?: string; compact?: boolean }) {
  const load = useCallback((signal: AbortSignal) => listAssignments(signal, classId), [classId]);
  const { data, loading, error, reload } = useRemoteData(load);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('All assignments');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const now = useNow();
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) reload(); }, 30000);
    return () => clearInterval(timer);
  }, [reload]);
  const selected = data?.find(item => item.id === selectedId);
  const classes = [...new Map((data ?? []).map(item => [item.class_id, item.class_name])).entries()];
  const visible = (data ?? []).filter(item => (!classFilter || item.class_id === classFilter)
    && (filter === 'All assignments' || assignmentStatus(item, now) === filter)
    && (item.title + ' ' + item.class_name).toLowerCase().includes(query.trim().toLowerCase()));

  return <section className="panel assignments-panel" aria-label={classId ? 'Class assignments' : 'Assignments'}>
    <div className="assignments-heading"><div><h2>{compact ? 'Recent assignments' : classId ? 'Class assignments' : 'Your assignments'}</h2>
      <p>{classId ? 'Papers shared with this class.' : 'Published papers and student submissions.'}</p></div>
      <button className="icon-btn" title="Refresh assignments" aria-label="Refresh assignments" disabled={loading} onClick={reload}><RefreshCw size={17} /></button>
    </div>
    {!compact && <div className="assignment-filters">
      <input aria-label="Search assignments" placeholder="Search assignments" value={query} onChange={e => setQuery(e.target.value)} />
      {!classId && <select aria-label="Filter assignments by class" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
        <option value="">All classes</option>{classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>}
      <select aria-label="Filter assignments by status" value={filter} onChange={e => setFilter(e.target.value)}>
        {['All assignments', 'Published', 'Ready for grading', 'Closed'].map(value => <option key={value}>{value}</option>)}
      </select>
    </div>}
    {error ? <div className="assignment-empty"><p>Unable to load this content.</p><button className="btn secondary" onClick={reload}>Try again</button></div>
      : !data && loading ? <p className="assignment-empty" role="status">Loading assignments...</p>
        : !visible.length ? <div className="assignment-empty"><FileText size={28} /><h3>{data?.length ? 'No matching assignments' : 'No assignments yet'}</h3>
          <p>{data?.length ? 'Try another search or filter.' : 'Review a practice paper and publish it to a class to get started.'}</p></div>
          : <div className="table-scroll"><table className="live-assignment-table"><thead><tr><th>Practice paper</th>{!classId && <th>Class</th>}<th>Submissions</th><th>Due date</th><th>Status</th></tr></thead>
            <tbody>{(compact ? visible.slice(0, 4) : visible).map(item => <tr key={item.id}>
              <td><button className="assignment-title" onClick={() => setSelectedId(item.id)}>{item.title}<ArrowUpRight size={15} /></button>
                <small>{item.question_count} questions / {item.duration_minutes} minutes</small></td>
              {!classId && <td>{item.class_name}</td>}
              <td>{item.submitted_count} / {item.student_count}<small>{Math.max(0, item.student_count - item.submitted_count)} not submitted</small></td>
              <td>{singaporeDate(item.due_at)}</td><td><Status assignment={item} now={now} /></td>
            </tr>)}</tbody></table></div>}
    {selected && <AssignmentDetail assignment={selected} onClose={() => { setSelectedId(null); reload(); }} />}
  </section>;
}

function Status({ assignment, now }: { assignment: ClassAssignment; now: number }) {
  const status = assignmentStatus(assignment, now);
  return <span className={'assignment-status ' + (status === 'Ready for grading' ? 'ready' : '')}>{status}</span>;
}

function AssignmentDetail({ assignment, onClose }: { assignment: ClassAssignment; onClose: () => void }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [students, submissions] = await Promise.all([listClassStudents(assignment.class_id, signal), listSubmissions(assignment.id, signal)]);
    return { students, submissions };
  }, [assignment.class_id, assignment.id]);
  const { data, loading, error, reload } = useRemoteData(load);
  const [filter, setFilter] = useState('All students');
  const toast = useToast();
  const [viewing, setViewing] = useState<SubmissionSummary | null>(null);
  const now = useNow();
  const rows = (data?.students ?? []).map(student => ({
    id: student.id, name: student.name, code: student.student_code, former: false,
    submission: data?.submissions.find(row => row.student_id === student.id),
  }));
  for (const submission of data?.submissions ?? []) {
    if (!rows.some(row => row.id === submission.student_id)) rows.push({
      id: submission.student_id, name: submission.students.name, code: submission.student_code, former: true, submission,
    });
  }
  const visible = rows.filter(row => filter === 'All students' || (filter === 'Submitted' ? !!row.submission : !row.submission));
  const link = assignmentLink(assignment.share_token);
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success('Student link copied.'); }
    catch { toast.error('Copy is unavailable. Select and copy the link below.'); }
  }
  if (viewing) return <SubmissionPreview submission={viewing} paperId={assignment.paper_id} onClose={() => setViewing(null)} />;
  return <Modal title={assignment.title} subtitle={assignment.class_name} onClose={onClose} className="assignment-detail" wide>
    <div className="modal-body">
      <div className="assignment-summary"><Status assignment={assignment} now={now} /><span>Due {singaporeDate(assignment.due_at)}</span></div>
      <p className="class-help">Students open this link and enter their class student code. No login needed.</p>
      <div className="copy-field"><input aria-label="Student access link" readOnly value={link} />
        <button className="icon-btn" aria-label="Copy assignment link" onClick={() => void copy()}><Copy size={17} /></button></div>
      <a className="text-link" href={link} target="_blank" rel="noreferrer">Open student page<ArrowUpRight size={15} /></a>
      <div className="assignment-student-heading"><h3>Student submissions</h3>
        <select aria-label="Filter student submissions" value={filter} onChange={e => setFilter(e.target.value)}>
          {['All students', 'Not submitted', 'Submitted'].map(value => <option key={value}>{value}</option>)}
        </select><button className="icon-btn" aria-label="Refresh submissions" onClick={reload}><RefreshCw size={16} /></button>
      </div>
      {loading ? <p role="status">Loading submissions...</p> : error ? <p>Unable to load this content.</p> : <>
        {!visible.length && <p className="class-help">{rows.length ? 'No students in this group.' : 'No students in this class yet.'}</p>}
        <ul className="assignment-student-list">{visible.map(row => <li key={row.id}>
          <div><strong>{row.name || row.code}</strong><small>{row.name ? row.code : 'Name not added'}{row.former ? ' / Former class member' : ''}</small></div>
          <span>{row.submission ? 'Submitted' : 'Not submitted'}{row.submission && <small>{singaporeDate(row.submission.submitted_at)}</small>}</span>
          {row.submission && <button className="btn secondary" onClick={() => setViewing(row.submission!)}>View work</button>}
        </li>)}</ul>
      </>}
    </div>
  </Modal>;
}

function SubmissionPreview({ submission, paperId, onClose }: { submission: SubmissionSummary; paperId: string; onClose: () => void }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [work, paper] = await Promise.all([getSubmission(submission.id), getPaper(paperId)]);
    const photos = work.attachments.length ? await getAttachmentUrls(submission.id, signal) : [];
    return { work, paper, photos };
  }, [submission.id, paperId]);
  const { data, loading, error, reload } = useRemoteData(load);
  return <Modal title={submission.students.name || submission.student_code} subtitle={'Submitted ' + singaporeDate(submission.submitted_at)} onClose={onClose} wide>
    {loading ? <p className="assignment-empty" role="status">Loading submitted work...</p>
      : error ? <div className="assignment-empty"><p>Unable to load this content.</p><button className="btn secondary" onClick={reload}>Try again</button></div>
        : data && <div className="submitted-work">
          {data.photos.map(photo => <figure key={photo.url}><img src={photo.url} alt={photo.name} /><figcaption>{photo.name}</figcaption></figure>)}
          {Object.values(data.work.drawing).some(strokes => strokes.length) && <div className="exam-paper-stage">
            <ExamPaper paper={data.paper} view="questions" handwriting={{ drawing: data.work.drawing, tool: 'scroll', onChange: () => {} }} />
          </div>}
        </div>}
  </Modal>;
}
