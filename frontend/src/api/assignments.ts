import type { ItemColour } from '../lib/colours';
import { supabase } from '../lib/supabase';
import type { Paper } from '../data';
import type { ClassAssignment, Submission, SubmissionSummary } from '../types/assignments';

function client() {
  if (!supabase) throw new Error('Please log in to manage your assignments.');
  return supabase;
}
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === '22023') throw new Error(error.message);
  throw new Error('Could not save or load your papers and assignments. Please try again.');
}
export type PaperRow = {
  color: ItemColour; is_archived: boolean;
  id: string; title: string; subject: string; school_year: number; subject_level: string;
  duration_minutes: number; instructions: string; status: NonNullable<Paper['status']>;
  questions_snapshot: Paper['questions']; updated_at: string;
};
export function toPaper(row: PaperRow): Paper {
  return { id: row.id, color: row.color, is_archived: row.is_archived, title: row.title, subject: row.subject,
    level: 'Secondary ' + row.school_year + ' (' + row.subject_level + ')',
    duration: row.duration_minutes, instructions: row.instructions, status: row.status,
    approved: row.status === 'reviewed' || row.status === 'published',
    questions: row.questions_snapshot, topics: [...new Set(row.questions_snapshot.map(q => q.topic))],
    difficulty: [...new Set(row.questions_snapshot.map(q => q.bankQuestion?.difficulty).filter(Boolean))].join(' / '),
  };
}
export async function listPapers(signal: AbortSignal): Promise<Paper[]> {
  const { data, error } = await client().from('papers').select('*')
    .order('created_at', { ascending: false }).abortSignal(signal);
  check(error);
  return (data ?? []).map(row => toPaper(row as PaperRow));
}
export async function getPaper(id: string): Promise<Paper> {
  const { data, error } = await client().from('papers').select('*').eq('id', id).single();
  check(error);
  if (!data) throw new Error('Paper not found.');
  return toPaper(data as PaperRow);
}
export async function savePaper(paper: Paper): Promise<Paper> {
  if (paper.status === 'published') return getPaper(paper.id);
  const scope = paper.questions[0]?.bankQuestion;
  if (!scope || !paper.title.trim() || !paper.questions.length) throw new Error('Choose questions and enter a paper title.');
  const { data, error } = await client().from('papers').upsert({
    id: paper.id, color: paper.color, title: paper.title.trim(), subject: scope.subject, school_year: scope.school_year,
    subject_level: scope.subject_level, duration_minutes: paper.duration,
    instructions: paper.instructions ?? 'Answer all questions. Show your working clearly. Calculators are permitted.',
    questions_snapshot: paper.questions, status: 'draft',
  }).select('*').single();
  check(error);
  if (!data) throw new Error('Could not save the paper.');
  if (!paper.approved) return toPaper(data as PaperRow);
  const { data: reviewed, error: reviewError } = await client().from('papers').update({ status: 'reviewed' })
    .eq('id', paper.id).eq('updated_at', data.updated_at).select('*').single();
  check(reviewError);
  if (!reviewed) throw new Error('The paper changed. Open and review it again.');
  return toPaper(reviewed as PaperRow);
}
export async function publishAssignments(paperId: string, classIds: string[], dueAt: string) {
  const { data, error } = await client().rpc('publish_assignments', {
    p_paper_id: paperId, p_class_ids: classIds, p_due_at: dueAt,
  });
  check(error);
  return data as { id: string; class_id: string }[];
}
export async function listAssignments(signal: AbortSignal, classId?: string): Promise<ClassAssignment[]> {
  const rows: ClassAssignment[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await client().rpc('list_assignments', { p_class_id: classId ?? null })
      .range(from, from + 499).abortSignal(signal);
    check(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
export async function listSubmissions(assignmentId: string, signal: AbortSignal): Promise<SubmissionSummary[]> {
  const { data, error } = await client().from('submissions')
    .select('id,student_id,student_code,submitted_at,students!inner(name)')
    .eq('assignment_id', assignmentId).order('submitted_at').abortSignal(signal);
  check(error);
  return (data ?? []) as unknown as SubmissionSummary[];
}
export async function getSubmission(id: string): Promise<Submission> {
  const { data, error } = await client().from('submissions').select('*,students!inner(name)').eq('id', id).single();
  check(error);
  return data as unknown as Submission;
}
export async function getAttachmentUrls(id: string, signal: AbortSignal): Promise<{ name: string; url: string }[]> {
  const { data } = await client().auth.getSession();
  const response = await fetch('/api/v1/submissions/' + id + '/attachments', {
    signal, headers: { Authorization: 'Bearer ' + data.session?.access_token },
  });
  if (!response.ok) throw new Error('Could not load the submitted photos. Please try again.');
  return response.json();
}

export async function updatePaperColour(id: string, color: ItemColour): Promise<Paper> {
  const { data, error } = await client().from('papers').update({ color }).eq('id', id).select('*').single();
  check(error);
  if (!data) throw new Error('This paper is unavailable. Please refresh the page.');
  return toPaper(data as PaperRow);
}

export async function deletePaper(id: string): Promise<void> {
  // Foreign keys remove dependent assignments and submissions.
  const { data, error } = await client().from('papers').delete()
    .eq('id', id).select('id').single();
  check(error);
  if (!data) throw new Error('This paper is unavailable. Please refresh your library.');
}

export async function setPaperArchived(id: string, is_archived: boolean): Promise<Paper> {
  const { data, error } = await client().from('papers').update({ is_archived }).eq('id', id).select('*').single();
  check(error);
  if (!data) throw new Error('This paper is unavailable. Please refresh your library.');
  return toPaper(data as PaperRow);
}
