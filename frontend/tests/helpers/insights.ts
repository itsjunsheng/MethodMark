import type { Page } from '@playwright/test';
import type { Insights } from '../../src/types/insights';

export const emptyInsights: Insights = {
  classes: [], status: [], trend: [], topics: [], mistakes: [], students: [],
  distribution: ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'].map(label => ({ label, count: 0 })),
  summary: { assignments: 0, students: 0, submissions: 0, reviewed: 0, checked_parts: 0, total_parts: 0,
    average: null, method_rate: null, answer_rate: null, slips: { count: 0, parts: 0, percent: null } },
};

const student = (id: string, name: string | null, code: string, average: number | null, gaps: string[], topics: [string, number, number][] = []) => ({
  id, name, code, class_name: 'Saturday maths', active: true, submitted: average === null ? 0 : 2, reviewed: average === null ? 0 : 2,
  average, method_rate: average === null ? null : Math.min(100, average + 15), answer_rate: average === null ? null : Math.max(0, average - 20),
  gaps, topics: topics.map(([topic, percent, class_percent]) => ({ topic, percent, class_percent })),
  history: average === null ? [] : [
    { assignment_id: 'a1', title: 'Algebra checkpoint', date: '2026-09-20T15:59:00Z', percent: average - 6, complete: true },
    { assignment_id: 'a2', title: 'Quadratics practice', date: '2026-10-02T15:59:00Z', percent: average + 4, complete: true },
  ],
});

export const sampleInsights: Insights = {
  classes: [{ id: '40000000-0000-4000-8000-000000000001', name: 'Saturday maths' }, { id: '40000000-0000-4000-8000-000000000002', name: 'Sunday maths' }],
  summary: { assignments: 3, students: 8, submissions: 14, reviewed: 10, checked_parts: 52, total_parts: 70,
    average: 64.5, method_rate: 78.2, answer_rate: 51.3, slips: { count: 9, parts: 31, percent: 29 } },
  status: [
    { assignment_id: 'a1', title: 'Algebra checkpoint', class_name: 'Saturday maths', due_at: '2026-09-20T15:59:00Z', students: 8, submitted: 7, not_submitted: 1, processing: 0, awaiting_review: 1, failed: 0, reviewed: 6 },
    { assignment_id: 'a2', title: 'Quadratics practice', class_name: 'Saturday maths', due_at: '2026-10-02T15:59:00Z', students: 8, submitted: 6, not_submitted: 2, processing: 1, awaiting_review: 0, failed: 1, reviewed: 4 },
    { assignment_id: 'a3', title: 'Coordinate geometry', class_name: 'Sunday maths', due_at: '2026-10-09T15:59:00Z', students: 4, submitted: 1, not_submitted: 3, processing: 1, awaiting_review: 0, failed: 0, reviewed: 0 },
  ],
  trend: [
    { assignment_id: 'a1', title: 'Algebra checkpoint', class_id: '40000000-0000-4000-8000-000000000001', class_name: 'Saturday maths', date: '2026-09-20T15:59:00Z', average: 58.3, reviewed: 6, submitted: 7 },
    { assignment_id: 'a2', title: 'Quadratics practice', class_id: '40000000-0000-4000-8000-000000000001', class_name: 'Saturday maths', date: '2026-10-02T15:59:00Z', average: 71.4, reviewed: 4, submitted: 6 },
    { assignment_id: 'a3', title: 'Coordinate geometry', class_id: '40000000-0000-4000-8000-000000000002', class_name: 'Sunday maths', date: '2026-10-09T15:59:00Z', average: null, reviewed: 0, submitted: 1 },
  ],
  distribution: [{ label: '0–19%', count: 0 }, { label: '20–39%', count: 1 }, { label: '40–59%', count: 3 }, { label: '60–79%', count: 4 }, { label: '80–100%', count: 2 }],
  topics: [
    { topic: 'Quadratic equations', percent: 48, earned: 12, available: 25, students: 7, below: 4 },
    { topic: 'Coordinate geometry', percent: 66.7, earned: 16, available: 24, students: 6, below: 2 },
    { topic: 'Linear equations', percent: 85, earned: 17, available: 20, students: 7, below: 0 },
  ],
  mistakes: [
    { question: 'Solve 2x² + x − 6 = 0.', paper: 'Quadratics practice', number: 2, topics: ['Quadratic equations'], code: 'A1',
      criterion: 'Obtains both roots, 3/2 and −2.', missed: 5, assessed: 6, rate: 83.3, students: ['Aisha', 'red-fox', 'Ben', 'Chen', 'Dana'],
      feedback: ['Your factorisation is right. Check the signs when you solve each bracket.'] },
    { question: 'Find the equation of the line PQ.', paper: 'Coordinate geometry', number: 3, topics: ['Coordinate geometry'], code: 'M1',
      criterion: 'Substitutes one given point into a line equation with the gradient.', missed: 2, assessed: 6, rate: 33.3, students: ['Ben', 'Chen'], feedback: [] },
  ],
  students: [
    student('s2', null, 'red-fox', 41.7, ['Quadratic equations', 'Coordinate geometry'], [['Quadratic equations', 30, 48], ['Coordinate geometry', 50, 66.7]]),
    student('s1', 'Aisha', 'blue-otter', 70.8, ['Quadratic equations'], [['Quadratic equations', 55, 48], ['Linear equations', 90, 85]]),
    student('s3', 'Ben', 'teal-owl', null, []),
  ],
};

export async function mockInsights(page: Page, data: Insights = sampleInsights) {
  const requests: URL[] = [];
  await page.route('**/api/v1/insights**', route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: data });
  });
  return requests;
}
