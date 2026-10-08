import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type { Paper } from '../../src/data';
import type { ClassAssignment } from '../../src/types/assignments';
import { mockClasses } from './classes';

type SavedPaper = {
  color?: string; is_archived?: boolean;
  id: string; title: string; subject: string; school_year: number; subject_level: string;
  duration_minutes: number; instructions: string; status: string; questions_snapshot: Paper['questions'];
  question_count: number; created_at: string; updated_at: string;
};
type Work = { id: string; assignment_id: string; student_id: string; student_code: string;
  submitted_at: string; drawing: object; drawing_sizes?: Record<string, [number, number]>; attachments: object[]; students: { name: string | null } };
export const testToken = '30000000-0000-4000-8000-000000000001';

export async function mockAssignments(page: Page, school?: Awaited<ReturnType<typeof mockClasses>>) {
  const state = { papers: [] as SavedPaper[], assignments: [] as ClassAssignment[], submissions: [] as Work[],
    failSave: false, failPublish: false, failSubmit: false, failLoad: false, failDeleteAssignment: false };
  const summary = (item: ClassAssignment) => {
    const members = school?.students.filter(row => row.class_id === item.class_id && row.is_active) ?? [];
    return { ...item, student_count: members.length,
      submitted_count: state.submissions.filter(s => s.assignment_id === item.id && members.some(m => m.id === s.student_id)).length };
  };
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1);
    const id = url.searchParams.get('id')?.replace('eq.', '');
    if (table === 'papers') {
      if (request.method() === 'DELETE') {
        if (state.failSave) return route.fulfill({ status: 503, json: { message: 'Delete failed' } });
        const removed = state.assignments.filter(a => a.paper_id === id).map(a => a.id);
        state.papers = state.papers.filter(p => p.id !== id);
        state.assignments = state.assignments.filter(a => a.paper_id !== id);
        state.submissions = state.submissions.filter(s => !removed.includes(s.assignment_id));
        return route.fulfill({ json: { id } });
      }
      if (request.method() === 'POST' || request.method() === 'PATCH') {
        if (state.failSave) return route.fulfill({ status: 503, json: { message: 'Save failed' } });
        const body = request.postDataJSON();
        const existing = state.papers.find(p => p.id === (body.id ?? id));
        const row = { is_archived: false, ...existing, ...body, id: body.id ?? id, created_at: existing?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(), question_count: (body.questions_snapshot ?? existing?.questions_snapshot ?? []).length };
        state.papers = [row, ...state.papers.filter(p => p.id !== row.id)];
        return route.fulfill({ json: row });
      }
      return route.fulfill({ json: id ? state.papers.find(p => p.id === id) : state.papers.filter(p => url.searchParams.get('is_archived') !== 'eq.false' || !p.is_archived) });
    }
    if (table === 'publish_assignments') {
      if (state.failPublish) return route.fulfill({ status: 503, json: { message: 'Publish failed' } });
      const body = request.postDataJSON();
      const paper = state.papers.find(p => p.id === body.p_paper_id)!;
      if (paper.is_archived) return route.fulfill({ status: 400, json: { code: '22023', message: 'Save and review the paper before publishing.' } });
      paper.status = 'published';
      for (const classId of body.p_class_ids) {
        if (state.assignments.some(a => a.class_id === classId && a.paper_id === paper.id)) continue;
        state.assignments.push({
          id: randomUUID(), share_token: randomUUID(), class_id: classId, paper_id: paper.id,
          class_name: school?.classes.find(c => c.id === classId)?.name ?? 'Saturday maths',
          title: paper.title, subject: paper.subject, school_year: paper.school_year, subject_level: paper.subject_level,
          question_count: paper.question_count, duration_minutes: paper.duration_minutes, status: 'published',
          due_at: body.p_due_at, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
          submitted_count: 0, student_count: 0,
        });
      }
      return route.fulfill({ json: state.assignments.filter(a => a.paper_id === paper.id) });
    }
    if (table === 'list_assignments') {
      if (state.failLoad) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      const classId = request.postDataJSON().p_class_id;
      const from = Number(url.searchParams.get('offset') || 0);
      const count = Number(url.searchParams.get('limit') || 500);
      return route.fulfill({ json: state.assignments.filter(a => !classId || a.class_id === classId).slice(from, from + count).map(summary) });
    }
    if (table === 'submissions') {
      const assignment = url.searchParams.get('assignment_id')?.replace('eq.', '');
      return route.fulfill({ json: id ? state.submissions.find(s => s.id === id) : state.submissions.filter(s => s.assignment_id === assignment) });
    }
    return route.fallback();
  });
  await page.route('**/api/v1/assignments/*', async route => {
    const request = route.request();
    expect(request.method()).toBe('DELETE');
    expect(request.headers().authorization).toMatch(/^Bearer /);
    if (state.failDeleteAssignment) return route.fulfill({ status: 503, json: { detail: 'Could not delete this assignment. Please try again.' } });
    const id = new URL(request.url()).pathname.split('/').at(-1);
    state.assignments = state.assignments.filter(a => a.id !== id);
    state.submissions = state.submissions.filter(s => s.assignment_id !== id);
    return route.fulfill({ status: 204, body: '' });
  });
  if (school) school.onClassDeleted = classId => {
    const removed = new Set(state.assignments.filter(a => a.class_id === classId).map(a => a.id));
    state.assignments = state.assignments.filter(a => a.class_id !== classId);
    state.submissions = state.submissions.filter(s => !removed.has(s.assignment_id));
  };
  await page.route('**/api/v1/student/assignments/**', async route => {
    const request = route.request(), segments = new URL(request.url()).pathname.split('/');
    const assignment = state.assignments.find(a => a.share_token === segments[5]);
    if (!assignment) return route.fulfill({ status: 404, json: { detail: 'This assignment is unavailable.' } });
    const paper = state.papers.find(p => p.id === assignment.paper_id)!;
    const meta = { id: assignment.id, title: paper.title, class_name: assignment.class_name,
      due_at: assignment.due_at, duration: paper.duration_minutes, question_count: paper.question_count,
      accepting_submissions: !assignment.due_at || new Date(assignment.due_at).getTime() > Date.now() };
    if (request.method() === 'GET') return route.fulfill({ json: meta });
    if (segments[6] === 'open') {
      const code = request.postDataJSON().student_code;
      const member = school?.students.find(m => m.class_id === assignment.class_id && m.student_code === code && m.is_active);
      if (!member) return route.fulfill({ status: 403, json: { detail: 'Check your student code with your tutor.' } });
      return route.fulfill({ json: { assignment: meta, student_code: code,
        submitted_at: state.submissions.find(s => s.student_id === member.id && s.assignment_id === assignment.id)?.submitted_at ?? null,
        paper: { id: paper.id, title: paper.title, subject: paper.subject, school_year: paper.school_year,
          subject_level: paper.subject_level, duration: paper.duration_minutes, instructions: paper.instructions,
          questions: paper.questions_snapshot.map(q => ({
            id: q.id, topic: q.topic, text: q.text, method: q.method, accuracy: q.accuracy,
            question_content: q.bankQuestion?.question_content,
            marks_by_part: q.bankQuestion ? Object.fromEntries(q.bankQuestion.marking_rubric.parts.map(part =>
              [part.part_id, part.marking_points.reduce((sum, point) => sum + point.max_marks, 0)])) : undefined,
          })),
        },
      } });
    }
    if (segments[6] === 'result') {
      const code = request.postDataJSON().student_code;
      const member = school?.students.find(m => m.class_id === assignment.class_id && m.student_code === code && m.is_active);
      const work = state.submissions.find(s => s.student_id === member?.id && s.assignment_id === assignment.id);
      return route.fulfill({ json: work ? { status: 'pending', submitted_at: work.submitted_at } : { status: 'not_submitted' } });
    }
    if (state.failSubmit) return route.fulfill({ status: 503, json: { detail: 'Could not save your work. Try again.' } });
    if (!meta.accepting_submissions) return route.fulfill({ status: 409, json: { detail: 'The submission deadline has passed.' } });
    const body = request.postData() ?? '';
    const field = (name: string) => body.split('name="' + name + '"\r\n\r\n')[1]?.split('\r\n')[0];
    const code = field('student_code')!, member = school!.students.find(m => m.class_id === assignment.class_id && m.student_code === code && m.is_active)!;
    const work: Work = { id: field('submission_id')!, assignment_id: assignment.id, student_id: member.id,
      student_code: code, submitted_at: new Date().toISOString(), drawing: JSON.parse(field('drawing')!), drawing_sizes: JSON.parse(field('drawing_sizes') ?? '{}'),
      attachments: [], students: { name: school!.students.find(s => s.id === member.id)?.name ?? null } };
    state.submissions.push(work);
    return route.fulfill({ json: { id: work.id, submitted_at: work.submitted_at } });
  });
  return state;
}

export async function mockStudentPaper(page: Page) {
  await page.route('**/api/v1/student/assignments/**', route => {
    const request = route.request(), segments = new URL(request.url()).pathname.split('/');
    const meta = { id: segments[5], title: 'Mathematics practice', class_name: 'Saturday maths',
      due_at: '2099-01-01T15:59:00Z', duration: 45, question_count: 4, accepting_submissions: true };
    if (request.method() === 'GET') return route.fulfill({ json: meta });
    if (segments[6] === 'submit') return route.fulfill({ json: { id: randomUUID(), submitted_at: new Date().toISOString() } });
    if (segments[6] === 'result') return route.fulfill({ json: { status: 'pending', submitted_at: new Date().toISOString() } });
    return route.fulfill({ json: { assignment: meta, student_code: request.postDataJSON().student_code,
      submitted_at: null, paper: { id: 'paper', title: meta.title, subject: 'Mathematics', school_year: 3,
        subject_level: 'G3', duration: 45, instructions: 'Show your working.',
        questions: Array.from({ length: 4 }, (_, i) => ({
          id: 'question-' + i, topic: 'Algebra', text: 'Solve x + ' + i + ' = 5.', method: 2, accuracy: 1,
        })),
      },
    } });
  });
}

export async function setupAssignmentSchool(page: Page) {
  const school = await mockClasses(page);
  school.classes.push(
    { id: '40000000-0000-4000-8000-000000000001', name: 'Saturday maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' },
    { id: '40000000-0000-4000-8000-000000000002', name: 'Sunday maths', subject: 'Mathematics', school_year: 3, subject_level: 'G3' },
  );
  school.students.push(
    { id: '50000000-0000-4000-8000-000000000001', name: 'Aisha', class_id: school.classes[0].id, student_code: 'blue-otter', is_active: true },
    { id: '50000000-0000-4000-8000-000000000002', name: null, class_id: school.classes[0].id, student_code: 'red-fox', is_active: true },
  );
  const db = await mockAssignments(page, school);
  return { school, db };
}
