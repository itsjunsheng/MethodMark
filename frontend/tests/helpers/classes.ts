import { expect, type Page } from '@playwright/test';
import type { Student } from '../../src/types/classes';

type ClassRow = { color?: string; id: string; name: string; subject: string; school_year: number; subject_level: string };

export async function mockClasses(page: Page) {
  const state = {
    classes: [] as ClassRow[], students: [] as Student[],
    failColour: false, failLoad: false, failRename: false, loseAddResponse: false, failRemove: false, failDeleteClass: false,
    deletedClasses: [] as string[],
    removals: [] as { classId: string | undefined; id: string | undefined }[],
    additions: [] as string[][],
  };
  const withCount = (item: ClassRow) => ({
    ...item, students: [{ count: state.students.filter(row => row.class_id === item.id && row.is_active).length }],
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    expect(request.headers().authorization).toMatch(/^Bearer /);
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const classId = url.searchParams.get('class_id')?.replace('eq.', '');
    const method = request.method();
    if (!['classes', 'students', 'add_class_students'].includes(table ?? '')) return route.fallback();
    if (state.failLoad && method === 'GET') return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    if (table === 'classes') {
      if (method === 'PATCH') {
        if (state.failColour) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        const row = state.classes.find(item => item.id === id);
        if (!row) return route.fulfill({ status: 406, json: { message: 'No rows' } });
        Object.assign(row, request.postDataJSON());
        return route.fulfill({ json: withCount(row) });
      }
      if (method === 'DELETE') {
        expect(id).toBeTruthy();
        if (state.failDeleteClass) {
          state.failDeleteClass = false;
          return route.fulfill({ status: 500, json: { message: 'Unavailable' } });
        }
        state.deletedClasses.push(id!);
        state.classes = state.classes.filter(item => item.id !== id);
        state.students = state.students.filter(row => row.class_id !== id);
        return route.fulfill({ status: 204, body: '' });
      }
      if (method === 'POST') {
        const row = request.postDataJSON() as ClassRow;
        if (!state.classes.some(item => item.id === row.id)) state.classes.push(row);
        return route.fulfill({ status: 201, body: '' });
      }
      expect(url.searchParams.get('students.is_active')).toBe('eq.true');
      return route.fulfill({ json: id ? withCount(state.classes.find(item => item.id === id)!) : state.classes.map(withCount) });
    }
    if (table === 'students') {
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        if (body.is_active === false) {
          state.removals.push({ classId, id });
          expect(classId).toBeTruthy();
          if (state.failRemove) {
            state.failRemove = false;
            return route.fulfill({ status: 500, json: { message: 'Unavailable' } });
          }
          const student = state.students.find(row => row.id === id && row.class_id === classId);
          if (student) student.is_active = false;
          return route.fulfill({ status: 204, body: '' });
        }
        if (state.failRename) {
          state.failRename = false;
          return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        }
        const student = state.students.find(item => item.id === id)!;
        student.name = body.name;
        return route.fulfill({ json: student });
      }
      expect(classId).toBeTruthy();
      expect(url.searchParams.get('is_active')).toBe('eq.true');
      const from = Number(url.searchParams.get('offset') || 0);
      const count = Number(url.searchParams.get('limit') || 500);
      return route.fulfill({ json: state.students.filter(row => row.class_id === classId && row.is_active).slice(from, from + count) });
    }
    const payload = request.postDataJSON();
    const ids = payload.p_student_ids as string[];
    state.additions.push(ids);
    for (const studentId of ids) {
      const existing = state.students.find(row => row.id === studentId);
      if (existing) {
        expect(existing.class_id).toBe(payload.p_class_id);
        expect(existing.is_active).toBe(true);
        continue;
      }
      const used = state.students.filter(row => row.class_id === payload.p_class_id).map(row => row.student_code);
      const code = ['blue-panda', 'green-otter', 'red-fox', 'gold-tiger', 'pink-owl'].find(code => !used.includes(code))!;
      state.students.push({ id: studentId, name: null, class_id: payload.p_class_id, student_code: code, is_active: true });
    }
    if (state.loseAddResponse) {
      state.loseAddResponse = false;
      return route.fulfill({ status: 503, json: { message: 'Response lost' } });
    }
    return route.fulfill({ json: state.students.filter(row => ids.includes(row.id) && row.class_id === payload.p_class_id) });
  });
  return state;
}
