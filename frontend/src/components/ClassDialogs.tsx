import { useToast } from './Toast';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { addClassStudents, createClass, deleteClass, removeClassStudent } from '../api/classes';
import type { ClassDetails, Student, TutorClass } from '../types/classes';
import { Modal } from './Modal';
import { randomColour } from '../lib/colours';

export function CreateClassDialog({ onClose, onCreated }: {
  onClose: () => void; onCreated: (item: TutorClass) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [details, setDetails] = useState<ClassDetails>(() => ({
    name: '', subject: 'Mathematics', school_year: 1, subject_level: 'G3', color: randomColour(),
  }));
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !details.name.trim()) return;
    setSaving(true); toast.dismiss();

    try { onCreated(await createClass(id, details)); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not create this class. Please try again.'); }
    finally { setSaving(false); }
  }

  return <Modal title="Create a class" onClose={() => { if (!saving) onClose(); }} className="class-dialog">
    <form className="modal-body" onSubmit={submit}>
      <fieldset disabled={saving} className="class-form">
        <label>Class name<input autoFocus required maxLength={100} placeholder="e.g. Saturday morning maths"
          value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></label>
        <div className="class-form-scope">
          <label>Subject<select value={details.subject} onChange={e => setDetails({ ...details, subject: e.target.value as ClassDetails['subject'] })}>
            <option>Mathematics</option><option>Additional Mathematics</option>
          </select></label>
          <label>School year<select value={details.school_year} onChange={e => setDetails({ ...details, school_year: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map(year => <option key={year} value={year}>Secondary {year}</option>)}
          </select></label>
          <label>Subject level<select value={details.subject_level} onChange={e => setDetails({ ...details, subject_level: e.target.value as ClassDetails['subject_level'] })}>
            {['G1', 'G2', 'G3'].map(level => <option key={level}>{level}</option>)}
          </select></label>
        </div>
      </fieldset>
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving || !details.name.trim()}>{saving ? 'Creating...' : 'Create class'}</button>
      </div>
    </form>
  </Modal>;
}

export function AddStudentsDialog({ classId, onClose, onAdded }: {
  classId: string; onClose: () => void; onAdded: () => void;
}) {
  const [count, setCount] = useState('1');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const batch = useRef<{ count: number; ids: string[] } | null>(null);
  const quantity = Number(count);
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 50;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !valid) return;
    setSaving(true); toast.dismiss();

    if (batch.current?.count !== quantity) batch.current = {
      count: quantity, ids: Array.from({ length: quantity }, () => crypto.randomUUID()),
    };
    try {
      await addClassStudents(classId, batch.current.ids);
      onAdded();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Could not add students. Please try again.');
    } finally { setSaving(false); }
  }

  return <Modal title="Add students" onClose={() => { if (!saving) onClose(); }} className="class-dialog">
    <form className="modal-body" onSubmit={submit}>
      <fieldset disabled={saving}>
        <div className="class-form">
          <p className="class-help">Each student gets a colour-animal code. You can add their names afterwards.</p>
          <label>Number of students<input type="number" min={1} max={50} step={1} required value={count}
            onChange={e => setCount(e.target.value)} aria-describedby="student-count-hint" /></label>
          <p className="class-help" id="student-count-hint">Add up to 50 students at a time.</p>
        </div>
      </fieldset>
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving || !valid}>
          {saving ? 'Adding...' : 'Add ' + (valid ? quantity + ' ' : '') + (quantity === 1 ? 'student' : 'students')}
        </button>
      </div>
    </form>
  </Modal>;
}

export function RemoveStudentDialog({ item, student, onClose, onRemoved }: {
  item: TutorClass; student: Student; onClose: () => void; onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const toast = useToast();

  async function remove() {
    if (removing) return;
    setRemoving(true); toast.dismiss();

    try {
      await removeClassStudent(item.id, student.id);
      onRemoved();
    } catch {
      toast.error('Could not remove this student. Please try again.');
    } finally { setRemoving(false); }
  }

  return <Modal title="Remove student?" className="class-dialog class-confirm-dialog"
    onClose={() => { if (!removing) onClose(); }}>
    <div className="modal-body">
      <p className="class-help">Remove <strong>{student.name ? student.name + ' (' + student.student_code + ')' : student.student_code}</strong> from <strong>{item.name}</strong>?</p>
      <p className="class-help class-confirm-note">Their code will stop working. Submitted work will be kept.</p>
      <div className="modal-actions">
        <button className="btn secondary" disabled={removing} onClick={onClose}>Cancel</button>
        <button className="btn confirm-danger" disabled={removing} onClick={() => void remove()}>
          {removing ? 'Removing...' : 'Remove from class'}
        </button>
      </div>
    </div>
  </Modal>;
}

export function DeleteClassDialog({ item, onClose, onDeleted }: {
  item: TutorClass; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true); toast.dismiss();

    try {
      await deleteClass(item.id);
      onDeleted();
    } catch {
      toast.error('Could not delete this class. Please try again.');
    } finally { setDeleting(false); }
  }

  return <Modal title="Delete class?" className="class-dialog class-confirm-dialog"
    onClose={() => { if (!deleting) onClose(); }}>
    <div className="modal-body">
      <p className="class-help">Permanently delete <strong>{item.name}</strong>, including its students, assignments and submitted work?</p>
      <p className="class-help class-confirm-note">Other classes and practice papers will be kept.</p>
      <div className="modal-actions">
        <button className="btn secondary" disabled={deleting} onClick={onClose}>Cancel</button>
        <button className="btn confirm-danger" disabled={deleting} onClick={() => void confirmDelete()}>
          {deleting ? 'Deleting...' : 'Delete class'}
        </button>
      </div>
    </div>
  </Modal>;
}
