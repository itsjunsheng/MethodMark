import { useToast, useToastError } from './Toast';
import { useEffect, useState } from 'react';
import { Check, Eraser, FileText, Hand, Pencil, Printer, Redo2, Send, Undo2, X } from 'lucide-react';
import type { StudentAccess } from '../types/assignments';
import { submitStudentAssignment } from '../api/studentAssignments';
import { singaporeDate } from '../lib/assignmentStatus';
import { useHandwriting } from '../lib/useHandwriting';
import type { InkTool } from '../lib/useHandwriting';
import { ExamPaper } from './ExamPaper';
import { PaperToolbar, PaperToolbarButton } from './PaperToolbar';
import { StudentResult } from './StudentResult';
import './StudentPaper.css';

export function StudentPaper({ token, access }: { token: string; access: StudentAccess }) {
  const { assignment, paper, student_code: studentCode } = access;
  const [submittedAt, setSubmittedAt] = useState(access.submitted_at);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const closed = !assignment.accepting_submissions || !!(assignment.due_at && new Date(assignment.due_at).getTime() <= now);
  const readOnly = !!submittedAt || closed || submitting;
  const [submissionId] = useState(() => {
    const key = 'methodmark:submission:' + assignment.id + ':' + studentCode;
    const id = crypto.randomUUID();
    try {
      const saved = localStorage.getItem(key);
      if (saved) return saved;
      localStorage.setItem(key, id);
    } catch { /* Retries in this tab still use the same id. */ }
    return id;
  });
  const draftKey = `methodmark:handwriting:v1:${assignment.id}:${paper.id}:${studentCode}`;
  const ink = useHandwriting(draftKey);
  useEffect(() => {
    if (!submittedAt) return;
    try { localStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ }
  }, [draftKey, submittedAt]);
  useToastError(readOnly ? '' : ink.saveError);
  const [tool, setTool] = useState<InkTool>('scroll');
  const [files, setFiles] = useState<File[]>([]);

  const hasWork = Object.values(ink.drawing).some(strokes => strokes.length > 0) || files.length > 0;

  async function submit() {
    if (readOnly || !hasWork) return;
    setSubmitting(true); toast.dismiss();
    try {
      const drawingSizes: Record<string, [number, number]> = {};
      document.querySelectorAll<HTMLElement>('[data-answer-area]').forEach(area => {
        const { width, height } = area.getBoundingClientRect();
        if (width > 0 && height > 0) drawingSizes[area.dataset.answerArea!] = [width, height];
      });
      const receipt = await submitStudentAssignment(token, studentCode, submissionId, ink.drawing, files, drawingSizes);
      setSubmittedAt(receipt.submitted_at); window.scrollTo(0, 0);
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Your work could not be submitted. Please try again.'); }
    finally { setSubmitting(false); }
  }

  if (submittedAt) return <section className="panel student-welcome">
    <span className="success-circle"><Check size={32} /></span>
    <h1>Your work has been submitted.</h1>
    <p>Your tutor can now see your submission.</p>
    <p className="field-hint">{studentCode} &middot; {singaporeDate(submittedAt)}</p>
    <StudentResult token={token} code={studentCode} />
  </section>;

  return <>
    <section className="student-exam-paper" aria-label="Published practice paper">
      <PaperToolbar className="student-exam-toolbar" title={studentCode} descriptionId="handwriting-help"
        description={readOnly ? 'Scroll or zoom to view your paper.'
          : tool === 'scroll' ? 'Choose Pen to write in the answer space.'
            : tool === 'pen' ? 'Use a stylus or mouse. Scroll to move around.'
              : 'Tap a stroke to erase. Undo restores it.'}>
        {!readOnly && <div className="paper-toolbar-group" role="group" aria-label="Handwriting tools">
          {([{ value: 'scroll', label: 'Scroll', Icon: Hand }, { value: 'pen', label: 'Pen', Icon: Pencil },
            { value: 'eraser', label: 'Eraser', Icon: Eraser }] as const).map(({ value, label, Icon }) =>
            <PaperToolbarButton key={value} label={label} icon={Icon} aria-pressed={tool === value} onClick={() => setTool(value)} />)}
          <span className="paper-toolbar-divider" aria-hidden="true" />
          <PaperToolbarButton label="Undo" icon={Undo2} iconOnly onClick={ink.undo} disabled={!ink.canUndo} />
          <PaperToolbarButton label="Redo" icon={Redo2} iconOnly onClick={ink.redo} disabled={!ink.canRedo} />
        </div>}
        <a className="btn secondary paper-toolbar-action" href="#student-submission" aria-label="Submit work" title="Submit work">
          <Send size={14} aria-hidden="true" /><span className="paper-toolbar-label">Submit work</span>
        </a>
        <PaperToolbarButton label="Print / Save PDF" icon={Printer} onClick={() => window.print()} />
      </PaperToolbar>
      <div className="exam-paper-stage"><ExamPaper paper={paper} view="questions"
        handwriting={{ drawing: ink.drawing, onChange: readOnly ? () => {} : ink.change, tool: readOnly ? 'scroll' : tool }} /></div>
    </section>
    <section id="student-submission" className="panel student-submission no-print" aria-labelledby="student-submission-heading">
      <h2 id="student-submission-heading">{closed ? 'Submissions are closed' : 'Ready to submit?'}</h2>
      <p>Due {singaporeDate(assignment.due_at)}</p>
      {!closed && <>
      <p>Your working is written on the paper above. You can print or save a PDF with your handwriting.</p>
      <details className="student-photo-option">
        <summary>Wrote on paper? Attach photos instead</summary>
        <div className="upload-area">
          <p>Choose clear JPG or PNG photos, up to 10 MB each. Up to 5 photos per submission. Photos are sent to your tutor with your handwriting.</p>
          <input aria-label="Upload handwritten solutions" type="file" accept="image/jpeg,image/png" multiple disabled={submitting} onChange={event => {
            const selected = Array.from(event.target.files || []);
            if (files.length + selected.length > 5) {
              toast.error('Attach up to 5 photos.');
            } else if (selected.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
              toast.error('Choose JPG or PNG images under 10 MB.');
            } else {
              toast.dismiss();
              setFiles(current => [...current, ...selected]);
            }
            event.target.value = '';
          }} />
          {files.map((file, index) => <div key={index} className="file-chosen"><FileText size={14} />{file.name}
            <button type="button" aria-label={`Remove ${file.name}`} disabled={submitting} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><X size={15} /></button>
          </div>)}
        </div>
      </details>
      <p className="field-hint">Check your working before submitting. You cannot change it afterwards.</p>
      <div className="modal-actions"><button type="button" className="btn primary" disabled={!hasWork || readOnly}
        onClick={() => void submit()}>{submitting ? 'Submitting...' : 'Submit work'}<Check size={16} /></button></div>
      </>}
    </section>
  </>;
}
