import { useToast } from './Toast';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Palette, Copy, GraduationCap, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { listClasses, listClassStudents, updateStudentName, updateClassColour } from '../api/classes';
import { useRemoteData } from '../lib/useRemoteData';
import type { Student, TutorClass } from '../types/classes';
import { AddStudentsDialog, CreateClassDialog, DeleteClassDialog, RemoveStudentDialog } from './ClassDialogs';
import { AssignmentsPanel } from './AssignmentsPanel';
import { ColourDialog } from './ColourDialog';
import { ItemCard } from './ItemCard';
import { colourStyle } from '../lib/colours';
import './ClassesPage.css';

const studentCount = (count: number) => count + (count === 1 ? ' student' : ' students');

export function ClassesPage() {
  const toast = useToast();
  const { data: classes, loading, error, reload, setData: setClasses } = useRemoteData(listClasses);
  const [activeClass, setActiveClass] = useState<TutorClass | null>(null);
  const [creating, setCreating] = useState(false);
  const [colourClass, setColourClass] = useState<TutorClass | null>(null);
  const colourDialog = colourClass && <ColourDialog name={colourClass.name} colour={colourClass.color}
    onClose={() => setColourClass(null)} onSave={async colour => {
      const updated = await updateClassColour(colourClass.id, colour);
      setClasses(current => current?.map(item => item.id === updated.id ? updated : item) ?? null);
      setActiveClass(current => current?.id === updated.id ? updated : current);
    }} />;

  if (activeClass) return <><ClassRoster key={activeClass.id} item={activeClass}
    onColour={() => setColourClass(activeClass)} onBack={() => { setActiveClass(null); reload(); }} />{colourDialog}</>;

  return <section className="classes-page" aria-label="Your classes">
    <div className="classes-toolbar">
      <div><h2>Your classes</h2><p>{classes ? classes.length + (classes.length === 1 ? ' class' : ' classes') : 'A place for every learner.'}</p></div>
      <button className="btn primary" onClick={() => setCreating(true)}><Plus size={17} />Create class</button>
    </div>
    {loading ? <p className="class-loading" role="status">Loading your classes...</p>
      : error ? <LoadError retry={reload} />
      : !classes?.length ? <div className="panel class-empty">
        <span className="class-empty-icon"><GraduationCap size={30} strokeWidth={1.5} /></span>
        <h2>Your first class starts here.</h2><p>Create a class, then add your students.<br />Their codes will be ready when you are.</p>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />Create your first class</button>
      </div> : <div className="classes-grid">
        {classes.map(item => <ItemCard key={item.id} className="tutor-class-card"
          title={item.name} colour={item.color} icon={GraduationCap} openLabel={'Open class ' + item.name}
          onOpen={() => setActiveClass(item)} onColour={() => setColourClass(item)}>
          <h3>{item.name}</h3><p>{item.subject}</p>
          <span className="class-card-bottom"><span>Secondary {item.school_year} / {item.subject_level}</span>
            <span><Users size={15} />{studentCount(item.students[0]?.count ?? 0)}<ArrowUpRight size={16} /></span></span>
        </ItemCard>)}
      </div>}
    {colourDialog}
    {creating && <CreateClassDialog onClose={() => setCreating(false)} onCreated={item => { setCreating(false); setActiveClass(item); reload(); toast.success('Class created.'); }} />}
  </section>;
}

function ClassRoster({ item, onBack, onColour }: { item: TutorClass; onBack: () => void; onColour: () => void }) {
  const load = useCallback((signal: AbortSignal) => listClassStudents(item.id, signal), [item.id]);
  const { data: students, error, loading, reload, setData: setStudents } = useRemoteData(load);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<Student | null>(null);
  const [query, setQuery] = useState('');
  const toast = useToast();
  const visible = (students ?? []).filter(student =>
    ((student.name ?? '') + ' ' + student.student_code).toLowerCase().includes(query.trim().toLowerCase()));

  async function copy(text: string, success: string) {
    try { await navigator.clipboard.writeText(text); toast.success(success); }
    catch { toast.error('Copy is unavailable. You can select and copy the codes from the list.'); }
  }

  return <section className="classes-page" aria-label="Class students">
    <button className="text-link class-back" onClick={onBack}><ArrowLeft size={16} />All classes</button>
    <div className="classes-toolbar class-roster-heading">
      <div className="class-colour-heading" style={colourStyle(item.color)}>
        <span className="item-card-icon" aria-hidden="true"><GraduationCap size={22} /></span>
        <div><h2>{item.name}</h2><p>{item.subject} / Secondary {item.school_year} / {item.subject_level}</p></div>
      </div>
      <div className="class-roster-actions">
        <button className="btn secondary" onClick={onColour}><Palette size={16} />Colour</button>
        <button className="btn secondary class-delete" onClick={() => setDeleting(true)}><Trash2 size={16} />Delete class</button>
        <button className="btn primary" disabled={loading || !!error} onClick={() => setAdding(true)}><Plus size={17} />Add students</button>
      </div>
    </div>
    <section className="panel class-roster">
      <div className="roster-toolbar">
        <div><h3>{studentCount(students?.length ?? 0)}</h3><p>Names are optional. You can add them at any time.</p></div>
        <button className="btn secondary" disabled={loading || !!error || !students?.length} onClick={() => void copy(
          (students ?? []).map(student => student.student_code + (student.name ? '\t' + student.name : '')).join('\n'), 'Student codes copied.',
        )}><Copy size={16} />Copy codes</button>
      </div>
      {loading ? <p className="class-loading" role="status">Loading students...</p>
        : error ? <LoadError retry={reload} />
        : !students?.length ? <div className="class-empty">
          <span className="class-empty-icon"><Users size={29} strokeWidth={1.5} /></span>
          <h3>Ready for your students.</h3><p>Add students to generate their colour-animal codes.<br />No student accounts needed.</p>
          <button className="btn secondary" onClick={() => setAdding(true)}><Plus size={16} />Add your first students</button>
        </div> : <>
          <div className="roster-search"><Search size={17} /><input aria-label="Search students" placeholder="Search by name or student code"
            value={query} onChange={e => setQuery(e.target.value)} /></div>
          <div className="roster-labels" aria-hidden="true"><span>Student code</span><span>Student name <small>optional</small></span><span /></div>
          <ul className="roster-list">
            {visible.map(student => <li key={student.id}>
              <div className="roster-code"><code>{student.student_code}</code>
                <button className="icon-btn" aria-label={'Copy code ' + student.student_code} title="Copy student code"
                  onClick={() => void copy(student.student_code, student.student_code + ' copied.')}><Copy size={15} /></button>
              </div>
              <StudentName student={student} onSaved={updated => setStudents(current =>
                current?.map(row => row.id === updated.id ? updated : row) ?? null,
              )} />
              <button className="icon-btn remove-student" aria-label={'Remove ' + student.student_code + ' from class'}
                title="Remove from class" onClick={() => setRemoving(student)}><Trash2 size={17} /></button>
            </li>)}
          </ul>
          {!visible.length && <p className="class-loading">No students match your search.</p>}
          <p className="roster-footnote">Student records and names are separate for each class.</p>
        </>}
    </section>
    <AssignmentsPanel key={students?.length ?? 0} classId={item.id} />
    {adding && <AddStudentsDialog classId={item.id}
      onClose={() => setAdding(false)} onAdded={() => { setAdding(false); toast.success('Students added. Their codes are ready below.'); setQuery(''); reload(); }} />}
    {deleting && <DeleteClassDialog item={item} onClose={() => setDeleting(false)} onDeleted={() => { onBack(); toast.success('Class deleted.'); }} />}
    {removing && <RemoveStudentDialog item={item} student={removing} onClose={() => setRemoving(null)} onRemoved={() => {
      setStudents(current => current?.filter(student => student.id !== removing.id) ?? null);
      toast.success(removing.student_code + ' removed from this class.');
      setRemoving(null);
    }} />}
  </section>;
}

function StudentName({ student, onSaved }: { student: Student; onSaved: (updated: Student) => void }) {
  const [name, setName] = useState(student.name ?? '');
  const [savedName, setSavedName] = useState(name);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const dirty = name.trim() !== savedName;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true); toast.dismiss();

    try {
      const updated = await updateStudentName(student.id, name);
      setName(updated.name ?? '');
      setSavedName(updated.name ?? '');
      // Keep search and copy in sync without reloading other unsaved name inputs.
      onSaved(updated);
      toast.success('Student name saved.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Could not save this name. Please try again.');
    } finally { setSaving(false); }
  }

  return <form className="student-name-form" onSubmit={submit}>
    <div><input aria-label={'Name for ' + student.student_code} placeholder="Add student's name" maxLength={100}
      value={name} disabled={saving} onChange={e => setName(e.target.value)} />
      <button className="btn secondary" disabled={saving || !dirty} aria-label={'Save name for ' + student.student_code}>
        {saving ? 'Saving...' : 'Save'}
      </button></div>
  </form>;
}

function LoadError({ retry }: { retry: () => void }) {
  return <div className="class-load-error"><p>Unable to load this list.</p>
    <button className="btn secondary" onClick={retry}><RefreshCw size={15} />Try again</button>
  </div>;
}
