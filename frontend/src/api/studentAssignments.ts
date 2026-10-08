import type { InkDrawing } from '../lib/useHandwriting';
import type { StudentAccess, StudentAssignment, StudentPaperPayload, StudentResultState } from '../types/assignments';

async function request<T>(token: string, action = '', options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/v1/student/assignments/' + encodeURIComponent(token) + action, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Could not open or save this paper. Please try again.');
  return data as T;
}
export function getStudentAssignment(token: string, signal: AbortSignal) {
  return request<StudentAssignment>(token, '', { signal });
}
export async function openStudentAssignment(token: string, code: string): Promise<StudentAccess> {
  const data = await request<Omit<StudentAccess, 'paper'> & { paper: StudentPaperPayload }>(token, '/open', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_code: code.trim().toLowerCase() }),
  });
  const paper = data.paper;
  return { ...data, paper: {
    id: paper.id, title: paper.title, subject: paper.subject,
    level: 'Secondary ' + paper.school_year + ' (' + paper.subject_level + ')',
    duration: paper.duration, instructions: paper.instructions, approved: true, status: 'published', difficulty: '',
    topics: [...new Set(paper.questions.map(question => question.topic))],
    questions: paper.questions.map(({ question_content, marks_by_part, ...question }) => ({
      ...question, solution: '', content: question_content, marksByPart: marks_by_part,
    })),
  } };
}
export function getStudentResult(token: string, code: string, signal?: AbortSignal) {
  return request<StudentResultState>(token, '/result', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_code: code }), signal,
  });
}
export function submitStudentAssignment(token: string, code: string, id: string, drawing: InkDrawing, files: File[], drawingSizes: Record<string, [number, number]> = {}) {
  const form = new FormData();
  form.set('student_code', code);
  form.set('submission_id', id);
  form.set('drawing', JSON.stringify(drawing));
  form.set('drawing_sizes', JSON.stringify(drawingSizes));
  files.forEach(file => form.append('files', file));
  return request<{ id: string; submitted_at: string }>(token, '/submit', { method: 'POST', body: form });
}
