import { MarkingQueue } from './components/MarkingQueue';
import { SettingsPage } from './components/SettingsPage';
import { NotificationsDialog } from './components/NotificationsDialog';
import { buildNotices, useNotifications } from './lib/useNotifications';
import { needsReview } from './lib/reviewState';
import { useGradingQueue } from './lib/useGradingQueue';
import { useToast } from './components/Toast';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BookOpen, ChartNoAxesCombined, Check, CheckCheck, ClipboardCheck, Clock3, FileText, FolderOpen, LayoutDashboard, Menu, Plus, Search, ShieldCheck, Sparkles, TrendingUp, Users, X, RotateCcw, Pencil, Printer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { initials, questionBank } from './data';
import type { Page, Paper } from './data';
import { questionMarks } from './lib/paperQuestions';
import { QuestionPrompt, QuestionSolution } from './components/QuestionContent';
import { ExamPaper } from './components/ExamPaper';
import { PaperCard } from './components/PaperCard';
import { PaperToolbar, PaperToolbarButton } from './components/PaperToolbar';
import { PaperActionBar } from './components/PaperActionBar';
import { ArchiveToggle } from './components/ArchiveToggle';
import { DeletePaperDialog } from './components/DeletePaperDialog';
import { PaperBuilderForm } from './components/PaperBuilderForm';
import { Modal } from './components/Modal';
import { ClassesPage } from './components/ClassesPage';
import { AssignmentsPanel } from './components/AssignmentsPanel';
import { PublishDialog } from './components/PublishDialog';
import { listAssignments, listPapers, savePaper, updatePaperColour, setPaperArchived } from './api/assignments';
import { useRemoteData } from './lib/useRemoteData';
import { assignmentStatus } from './lib/assignmentStatus';
import { fetchInsights } from './api/insights';
import { InsightsPage, TrendChart, downloadInsightsCsv, pct } from './components/Insights';

const singapore = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', ...options });
function greeting(now = new Date()) {
  const hour = Number(singapore({ hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}
const loadInsights = (signal: AbortSignal) => fetchInsights(signal);
const navigation: { page: Page; icon: LucideIcon }[] = [{ page: 'Overview', icon: LayoutDashboard }, { page: 'Practice papers', icon: FileText }, { page: 'Assignments', icon: ClipboardCheck }, { page: 'Marking queue', icon: CheckCheck }, { page: 'Classes & students', icon: Users }, { page: 'Insights', icon: ChartNoAxesCombined }];
const descriptions: Record<Page, string> = { Overview: 'Your teaching at a glance.', 'Practice papers': 'Thoughtful practice starts with a great paper.', Assignments: 'Every paper, every submission, all in one place.', 'Marking queue': 'AI does the first pass. You have the final say.', 'Classes & students': 'Know your students. Support their next step.', Insights: 'Turn each assessment into a better next lesson.', Settings: 'Manage your profile and preferences.' };
function Button({ children, onClick, variant = 'secondary', className = '', disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; className?: string; disabled?: boolean; type?: 'button' | 'submit' }) { return <button type={type} className={`btn ${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><FolderOpen size={32} /><h3>{title}</h3><p>{text}</p></div>; }

export default function App({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('Overview');
  const paperData = useRemoteData(listPapers);
  const assignmentData = useRemoteData(listAssignments);
  const [showPaperArchive, setShowPaperArchive] = useState(false);
  const papers = (paperData.data ?? []).filter(paper => !!paper.is_archived === showPaperArchive);
  const updatePaper = (updated: Paper) => {
    paperData.setData(current => current?.map(paper => paper.id === updated.id ? updated : paper) ?? null);
  };
  const [assignmentRevision, setAssignmentRevision] = useState(0);
  async function persistPaper(paper: Paper) {
    const saved = await savePaper(paper);
    paperData.setData(current => [saved, ...(current ?? []).filter(item => item.id !== saved.id)]);
    return saved;
  }
  const gradingData = useGradingQueue();
  const insightData = useRemoteData(loadInsights);
  const summary = insightData.data?.summary;
  const learners = (insightData.data?.students ?? []).filter(student => student.active);
  const [profile, setProfile] = useState({ name: String(user.user_metadata.name || 'Tutor') });
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const toast = useToast();
  const [modal, setModal] = useState<'create' | 'notifications' | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [deletingPaper, setDeletingPaper] = useState<Paper | null>(null);
  const [publishPaper, setPublishPaper] = useState<Paper | null>(null);
  const pending = (gradingData.data ?? []).filter(needsReview);
  const notices = buildNotices(gradingData.data ?? [], assignmentData.data ?? []);
  const alerts = useNotifications(user.id, notices);
  const [noticeSince, setNoticeSince] = useState('');
  const { reload: reloadAssignments } = assignmentData;
  useEffect(() => {
    // Keep deadline notifications current without a full page refresh.
    const timer = setInterval(() => { if (!document.hidden) reloadAssignments(); }, 60000);
    return () => clearInterval(timer);
  }, [reloadAssignments]);
  const notify = toast.success;
  const navigate = (next: Page) => { setPage(next); setQuery(''); setMobileNav(false); };
  return <div className="app-shell">
    {mobileNav && <button aria-label="Close navigation" className="nav-scrim" onClick={() => setMobileNav(false)} />}
    <aside id="tutor-navigation" className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview'); }}><span className="brand-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M6 24V10l10 9 10-9v14M13 10l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>MethodMark<span className="brand-period">.</span></span></a>
      <nav>{navigation.map(({ page: item, icon: Icon }) => <button key={item} aria-label={item} aria-current={page === item ? 'page' : undefined} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => navigate(item)}><Icon size={19} strokeWidth={1.7} /><span>{item}</span>{item === 'Marking queue' && pending.length > 0 && <span className="nav-count">{pending.length}</span>}</button>)}</nav>
      <div className="sidebar-account">
        <button className="profile" aria-label="Open profile settings" title={profile.name} onClick={() => navigate('Settings')}><span className="avatar profile-avatar">{initials(profile.name)}</span><span className="profile-copy"><strong>{profile.name}</strong><small>Mathematics tutor</small></span></button>
        <button className="icon-btn notification-btn" aria-label={alerts.unread ? `Notifications, ${alerts.unread} unread` : 'Notifications'} title="Notifications" onClick={() => { setMobileNav(false); setNoticeSince(alerts.seen); alerts.markSeen(); assignmentData.reload(); setModal('notifications'); }}><Bell size={19} />{alerts.unread > 0 && <i aria-hidden="true" />}</button>
      </div>
    </aside>
    <div className="main-shell">
    <main><button className="icon-btn mobile-menu" aria-label="Open navigation" aria-controls="tutor-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="page-heading"><div>{page === 'Overview' && <div className="eyebrow">{singapore({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}</div>}<h1>{page === 'Overview' ? `${greeting()}, ${profile.name.split(' ')[0]}` : page}{page === 'Overview' && <span className="greeting-dot">.</span>}</h1><p>{descriptions[page]}</p></div><div className="heading-actions">{page === 'Practice papers' && <ArchiveToggle archived={showPaperArchive} kind="papers" onChange={value => { setShowPaperArchive(value); setQuery(''); }} />}{page === 'Overview' && <Button disabled={!insightData.data?.students.length} onClick={() => { downloadInsightsCsv(insightData.data!); notify('Insights report downloaded.'); }}><ArrowDownToLine size={16} />Export report</Button>}{!['Marking queue', 'Classes & students', 'Settings', 'Insights'].includes(page) && <Button variant="primary" onClick={() => setModal('create')}><Plus size={17} />Create practice paper</Button>}</div></div>

    {page === 'Overview' && <>
      <section className="hero-card"><div className="hero-copy"><span className="hero-kicker"><span className="tiny-spark"><Sparkles size={13} /></span>YOUR TEACHING, WITH A LITTLE SUPERPOWER</span><h2>Less time marking.<br />More lightbulb moments.</h2><p>From the first question to the final method mark.<br className="desktop-break" /> Give every student the attention they deserve.</p><Button variant="primary" onClick={() => setModal('create')}><Sparkles size={16} />Create a practice paper<ArrowRight size={16} /></Button><span className="hero-footnote">Syllabus-aligned. Reviewed by you.</span></div><MathIllustration /></section>
      <div className="section-line"><h2>At a glance</h2><span><span className="live-dot" />Live <span className="muted">· updates as work comes in</span></span></div>
      <section className="stats-grid"><Stat icon={BookOpen} label="Active assignments" value={String((assignmentData.data ?? []).filter(a => assignmentStatus(a) === 'Published').length)} foot="Open for submissions" mini="papers" /><Stat icon={Users} label="Students" value={summary ? String(summary.students) : '–'} foot="In classes with assignments" mini="students" avatars={[...learners.slice(0, 3).map(student => student.name ? initials(student.name) : student.code.slice(0, 2).toUpperCase()), ...(learners.length > 3 ? ['+' + (learners.length - 3)] : [])]} /><Stat icon={ClipboardCheck} label="Awaiting review" value={String(pending.length)} foot={`${pending.filter(r => r.flagged).length} flagged for a closer look`} tone="amber" action={() => navigate('Marking queue')} /><Stat icon={TrendingUp} label="Class average" value={pct(summary?.average)} foot={summary?.checked_parts ? `From ${summary.checked_parts} checked parts` : 'Waiting for checked work'} mini="chart" spark={(insightData.data?.trend ?? []).flatMap(row => row.average === null ? [] : [row.average])} action={() => navigate('Insights')} /></section>
      <div className="dashboard-middle"><section className="panel performance-panel"><div className="panel-heading"><div><h2>Little steps, steady progress</h2><p>Average score per assignment, from work you have checked</p></div><button className="text-link" onClick={() => navigate('Insights')}>See insights<ArrowRight size={14} /></button></div>{insightData.data ? <TrendChart trend={insightData.data.trend} height={210} /> : <p className="insights-empty-note" role="status">{insightData.error ? 'Unable to load progress.' : 'Loading progress...'}</p>}<div className="chart-legend"><span className="approved-caption"><ShieldCheck size={12} />Checked work only</span></div></section><section className="panel review-summary"><div className="panel-heading"><h2>A little attention needed</h2><span className="soft-icon amber"><ClipboardCheck size={17} /></span></div><div className="review-big"><strong>{pending.length}</strong><div>submissions ready<br /><span>for your review</span></div></div><div className="review-breakdown"><span><i className="legend-dot green-dot" />Ready to check</span><strong>{pending.filter(r => !r.flagged).length}</strong></div><div className="review-breakdown"><span><i className="legend-dot amber-dot" />Flagged by AI</span><strong>{pending.filter(r => r.flagged).length}</strong></div><div className="review-note"><ShieldCheck size={16} /><span>Your approval. Their next step.<br />Results stay private until you release them.</span></div><Button variant="primary" onClick={() => navigate('Marking queue')}>Let’s review<ArrowRight size={16} /></Button></section></div>
      <div className="dashboard-bottom"><AssignmentsPanel key={assignmentRevision} compact /><section className="panel activity-panel"><div className="panel-heading"><h2>Latest activity</h2><span className="soft-icon"><Clock3 size={17} /></span></div><div className="timeline">{pending.slice(0, 3).map(item => <Activity key={item.submission_id} icon={ClipboardCheck} title={item.student_name || item.student_code} detail={item.paper_title + ' / Awaiting review'} time="" tone="green" />)}{pending.length === 0 && <p className="muted">No assessments awaiting review.</p>}</div><div className="activity-footer"><span className="live-dot" />You’re making progress. So are they.</div></section></div>
      <footer className="page-footer"><span>Made for the way you teach.</span><span><ShieldCheck size={13} />You’re always in control of the final mark.</span></footer>
    </>}

    {page === 'Practice papers' && <>{showPaperArchive && <h2 className="archive-heading">Archived papers</h2>}<div className="toolbar"><SearchField query={query} setQuery={setQuery} placeholder="Search your papers…" /><span className="muted">{papers.length} {papers.length === 1 ? 'paper' : 'papers'} {showPaperArchive ? 'in your archive' : 'in your library'}</span></div><div>{paperData.loading && <p role="status">Loading papers...</p>}{paperData.error && <div className="class-load-error"><p>Unable to load your papers.</p><Button onClick={paperData.reload}>Try again</Button></div>}</div><div className="paper-grid">{papers.filter(p => p.title.toLowerCase().includes(query.toLowerCase())).map(p => <PaperCard key={p.id} paper={p} onOpen={() => setSelectedPaper(p)}
      onColour={async colour => updatePaper(await updatePaperColour(p.id, colour))}
      onArchive={async () => updatePaper(await setPaperArchived(p.id, !p.is_archived))}
      onDelete={() => setDeletingPaper(p)} />)}</div>{!paperData.loading && !paperData.error && !papers.some(p => p.title.toLowerCase().includes(query.toLowerCase())) && <Empty title={showPaperArchive ? 'No archived papers found' : 'No papers found'} text={showPaperArchive ? 'Papers you archive will appear here. You can restore them at any time.' : 'Try a different title, or create a new practice paper.'} />}</>}

    {page === 'Assignments' && <AssignmentsPanel key={assignmentRevision} />}

    {page === 'Marking queue' && <MarkingQueue {...gradingData} />}

    {page === 'Classes & students' && <ClassesPage onDeleted={() => { assignmentData.reload(); setAssignmentRevision(value => value + 1); }} />}

    {page === 'Insights' && <InsightsPage onReview={() => navigate('Marking queue')} />}

    {page === 'Settings' && <SettingsPage user={user} name={profile.name} onNameChange={name => setProfile({ name })} onLogout={onLogout} />}
    </main></div>
    {modal === 'create' && <Modal title="A great practice paper starts here." className="paper-builder-modal" onClose={() => setModal(null)}><PaperBuilderForm onClose={() => setModal(null)} onSave={async p => { const saved = await persistPaper(p); setModal(null); setShowPaperArchive(false); setSelectedPaper(saved); notify('Paper saved. Review the questions and rubric before publishing.'); }} /></Modal>}
    {deletingPaper && <DeletePaperDialog paper={deletingPaper} onClose={() => setDeletingPaper(null)} onDeleted={() => {
      paperData.setData(current => current?.filter(paper => paper.id !== deletingPaper.id) ?? null);
      setDeletingPaper(null); assignmentData.reload(); setAssignmentRevision(value => value + 1);
    }} />}
    {selectedPaper && <PaperDetail paper={selectedPaper} onClose={() => setSelectedPaper(null)} onSave={async p => { const saved = await persistPaper(p); setSelectedPaper(saved); notify('Paper and rubric saved.'); return saved; }} onPublish={p => { setSelectedPaper(null); setPublishPaper(p); }} />}
    {publishPaper && <PublishDialog paper={publishPaper} onClose={() => setPublishPaper(null)} onPublished={() => {
      setPublishPaper(null); paperData.reload(); assignmentData.reload(); setAssignmentRevision(value => value + 1);
      navigate('Assignments'); notify('Assignment published. Open it to share the student link.');
    }} />}

    {modal === 'notifications' && <NotificationsDialog notices={notices} since={noticeSince} onClose={() => setModal(null)} onOpen={notice => { setModal(null); navigate(notice.target); }} />}
  </div>;
}

function SearchField({ query, setQuery, placeholder }: { query: string; setQuery: (v: string) => void; placeholder: string }) { return <div className="search-field"><Search size={17} /><input aria-label={placeholder} placeholder={placeholder} value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</div>; }
function Stat({ icon: Icon, label, value, foot, tone = '', mini, action, avatars = [], spark = [] }: { icon: LucideIcon; label: string; value: string; foot: string; tone?: string; mini?: string; action?: () => void; avatars?: string[]; spark?: number[] }) { return <button className={`panel stat-card ${action ? 'clickable' : ''}`} onClick={action} disabled={!action}><div className="stat-top"><span>{label}</span><Icon size={17} /></div><div className="stat-number">{value}{mini === 'chart' && spark.length > 1 && <svg className="mini-chart" viewBox="0 0 92 35" aria-hidden="true"><path d={'M' + spark.map((v, i) => `${1 + i * 90 / (spark.length - 1)},${34 - v / 100 * 33}`).join(' L')} fill="none" stroke="#3f8a5f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>}{mini === 'papers' && <div className="mini-bars">{[12, 22, 18, 29, 25, 36, 33].map((h, i) => <i key={i} style={{ height: h }} />)}</div>}{mini === 'students' && avatars.length > 0 && <div className="mini-avatars" aria-hidden="true">{avatars.map((avatar, index) => <span key={index}>{avatar}</span>)}</div>}{action && <span className="stat-arrow"><ArrowUpRight size={20} /></span>}</div><div className={`stat-foot ${tone}`}>{tone === 'green' && <TrendingUp size={13} />}{tone === 'amber' && <span className="legend-dot amber-dot" />}{foot}</div></button>; }
function MathIllustration() { return <div className="math-illustration" aria-hidden="true"><span className="math-scribble scribble-one">x² + possibility</span><span className="math-scribble scribble-two">a little progress, every day</span><span className="math-star star-one">✳</span><span className="math-star star-two">✦</span><div className="floating-tag"><span><Check size={12} /></span>Method matters.</div><div className="illustration-paper back-paper" /><div className="illustration-paper front-paper"><div className="illus-paper-header"><span className="illus-logo">m.</span><span>ONE STEP AT A TIME</span><i /></div><div className="illus-question"><span>01</span><strong>Let’s work it out.</strong><small>Find the roots of x² − 5x + 6 = 0</small></div><div className="handwriting">x² − 5x + 6 = 0<br /><span>(x − 2)(x − 3) = 0</span><br /><span className="answer">x = 2 or x = 3</span></div><div className="illus-tick tick-one"><Check size={23} /><small>M1</small></div><div className="illus-tick tick-two"><Check size={23} /><small>A1</small></div><div className="paper-rule" /><div className="illus-feedback"><span><Sparkles size={13} /></span><div>A clear method. A confident next step.</div></div></div><div className="floating-result"><span className="result-check"><Check size={19} /></span><div><strong>It’s more than a right answer.</strong><small>It’s understanding the why.</small></div></div><div className="illustration-orbit" /></div>; }
function Activity({ icon: Icon, title, detail, time, tone }: { icon: LucideIcon; title: string; detail: string; time: string; tone: string }) { return <div className="activity"><span className={`activity-icon ${tone}`}><Icon size={15} /></span><div><strong>{title}</strong><p>{detail}</p><small>{time}</small></div></div>; }

function PaperDetail({ paper, onClose, onSave, onPublish }: { paper: Paper; onClose: () => void; onSave: (p: Paper) => Promise<Paper>; onPublish: (p: Paper) => void }) {
  const [draft, setDraft] = useState(paper);
  const [showSolutions, setShowSolutions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(paper.approved);
  const stageRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const published = paper.status === 'published';
  async function save(publish = false) {
    if (saving) return;
    setSaving(true); toast.dismiss();
    try {
      const saved = published ? paper : await onSave({ ...draft, approved: reviewed });
      setDraft(saved); setEditing(false);
      if (publish) onPublish(saved);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Could not save this paper.');
    } finally { setSaving(false); }
  }
  const totalMarks = draft.questions.reduce((total, question) => total + questionMarks(question), 0);

  useEffect(() => { stageRef.current?.scrollTo({ top: 0 }); }, [showSolutions, editing]);

  const updateQuestion = (index: number, question: Paper['questions'][number]) => {
    setDraft(paper => ({ ...paper, questions: paper.questions.map((item, i) => i === index ? question : item), approved: false }));
    setReviewed(false);
  };

  const close = () => { if (!saving) onClose(); };

  return <Modal title="Your practice paper" onClose={close} className="paper-modal" wide
    header={<PaperToolbar title="Your practice paper" description={`${draft.level} / ${draft.subject} · ${draft.questions.length} questions · ${totalMarks} marks · ${draft.duration} min`} onClose={close}>
      {!published && !paper.is_archived && <PaperToolbarButton label={editing ? 'Done editing' : 'Edit paper'} icon={Pencil} disabled={saving}
        onClick={() => setEditing(!editing)} />}
      <PaperToolbarButton label={showSolutions ? 'Back to question paper' : 'Show solutions & rubric'} icon={BookOpen}
        disabled={editing} onClick={() => setShowSolutions(!showSolutions)} />
      <PaperToolbarButton label="Print / Save PDF" icon={Printer} disabled={editing} onClick={() => window.print()} />
    </PaperToolbar>}>
    <div className="exam-paper-stage" ref={stageRef}>
      {editing ? <div className="paper-editor">
        <label>Paper title<input value={draft.title} onChange={event => {
          setDraft({ ...draft, title: event.target.value, approved: false }); setReviewed(false);
        }} /></label>
        {draft.questions.map((question, index) => <div key={question.id} className="question-card">
          <div className="question-number">{index + 1}</div>
          <div className="question-content">
            <div className="question-topic"><span>{question.topic}</span><span>[{questionMarks(question)} marks]</span></div>
            {question.bankQuestion && <div className="question-level">Secondary {question.bankQuestion.school_year} &middot; {question.bankQuestion.subject_level} &middot; {question.bankQuestion.difficulty}</div>}
            <QuestionPrompt question={question} onChange={updated => updateQuestion(index, updated)} />
            <QuestionSolution question={question} onChange={updated => updateQuestion(index, updated)} />
            {!question.bankQuestion && questionBank[question.topic] && <button className="text-link" onClick={() => {
              const bank = questionBank[question.topic];
              const next = bank.find(item => item.text !== question.text) || bank[0];
              updateQuestion(index, { ...question, ...next });
            }}><RotateCcw size={13} />Replace with another sample</button>}
          </div>
        </div>)}
      </div> : <ExamPaper key={showSolutions ? 'solutions' : 'questions'} paper={draft} view={showSolutions ? 'solutions' : 'questions'} />}
    </div>
    <PaperActionBar actions={!paper.is_archived && <>
      {!published && !paper.is_archived && <PaperToolbarButton label={saving ? 'Saving...' : reviewed ? 'Save reviewed paper' : 'Save draft'}
        disabled={saving || !draft.title.trim()} onClick={() => void save()} />}
      <PaperToolbarButton variant="primary" label={published ? 'Assign to classes' : 'Publish assignment'} icon={ArrowRight}
        disabled={saving || !reviewed || !draft.title.trim() || draft.questions.some(question => !question.text.trim() || !question.solution.trim())}
        onClick={() => void save(true)} />
    </>}>
      {paper.is_archived ? <p>This paper is archived. Restore it from your library to edit or assign it.</p> : published ? <p>This published paper is fixed so every class receives the same questions.</p>
        : <label className="check-label"><input type="checkbox" checked={reviewed} disabled={saving}
          onChange={event => setReviewed(event.target.checked)} />I have reviewed every question, solution, and marking rubric.</label>}
    </PaperActionBar>
  </Modal>;
}
