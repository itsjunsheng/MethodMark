import type { BankQuestion } from './types/questionBank';

export type Page = 'Overview' | 'Practice papers' | 'Assignments' | 'Marking queue' | 'Classes & students' | 'Insights' | 'Settings';
export type Question = { id: string; topic: string; text: string; solution: string; method: number; accuracy: number; bankQuestion?: BankQuestion };
export type Paper = { id: string; title: string; level: string; subject: string; topics: string[]; difficulty: string; duration: number; questions: Question[]; approved: boolean };
export type Assignment = { id: string; paperId: string; title: string; className: string; due: string; submitted: number; total: number; status: 'Active' | 'Released' | 'Draft'; review: number; paperSnapshot?: Paper };
export type Mark = { method: number; accuracy: number; feedback: string; checked: boolean };
export type Review = { id: string; name: string; code: string; assignmentId: string; flagged: boolean; approved: boolean; marks: Mark[] };
export const classes = ['Sec 3 · E-Math', 'Sec 4 · E-Math', 'Sec 3 · A-Math', 'Sec 4 · A-Math'];
export const topics = ['Quadratic equations', 'Algebraic expressions', 'Trigonometry', 'Coordinate geometry', 'Statistics', 'Differentiation'];
export const questionBank: Record<string, Omit<Question, 'id'>[]> = {
  'Quadratic equations': [
    { topic: 'Quadratic equations', text: 'Solve x² − 5x + 6 = 0, showing your working clearly.', solution: 'x² − 5x + 6 = (x − 2)(x − 3) = 0. Therefore x = 2 or x = 3.', method: 2, accuracy: 1 },
    { topic: 'Quadratic equations', text: 'Solve 2x² + 7x + 3 = 0 by factorisation.', solution: '(2x + 1)(x + 3) = 0. Therefore x = −½ or x = −3.', method: 2, accuracy: 1 },
  ],
  'Algebraic expressions': [
    { topic: 'Algebraic expressions', text: 'Simplify 3(2x − 4) − 2(x + 5).', solution: '6x − 12 − 2x − 10 = 4x − 22.', method: 2, accuracy: 1 },
    { topic: 'Algebraic expressions', text: 'Factorise completely 6x² − 9x.', solution: 'The common factor is 3x. So 6x² − 9x = 3x(2x − 3).', method: 2, accuracy: 1 },
  ],
  Trigonometry: [
    { topic: 'Trigonometry', text: 'A right-angled triangle has a hypotenuse of 10 cm. One acute angle is 35°. Find the length of the side opposite this angle, to 3 significant figures.', solution: 'sin 35° = opposite / 10. Opposite = 10 sin 35° = 5.74 cm (3 s.f.).', method: 2, accuracy: 1 },
    { topic: 'Trigonometry', text: 'In a right-angled triangle, an acute angle θ has opposite side 6 cm and adjacent side 8 cm. Find θ to 1 decimal place.', solution: 'tan θ = 6/8. θ = tan⁻¹(0.75) = 36.9°.', method: 2, accuracy: 1 },
  ],
  'Coordinate geometry': [
    { topic: 'Coordinate geometry', text: 'Find the equation of the straight line passing through (2, 5) and (6, 13).', solution: 'Gradient = (13 − 5)/(6 − 2) = 2. y − 5 = 2(x − 2), so y = 2x + 1.', method: 2, accuracy: 1 },
    { topic: 'Coordinate geometry', text: 'Find the midpoint of the line segment joining A(−2, 3) and B(6, 7).', solution: 'Midpoint = ((−2 + 6)/2, (3 + 7)/2) = (2, 5).', method: 2, accuracy: 1 },
  ],
  Statistics: [
    { topic: 'Statistics', text: 'The scores of five students are 6, 8, 8, 10 and 13. Find the mean and the median.', solution: 'Mean = (6 + 8 + 8 + 10 + 13)/5 = 9. The middle value, and median, is 8.', method: 2, accuracy: 1 },
    { topic: 'Statistics', text: 'The mean of four numbers is 12. Three of the numbers are 8, 11 and 15. Find the fourth number.', solution: 'Total = 4 × 12 = 48. Fourth number = 48 − 8 − 11 − 15 = 14.', method: 2, accuracy: 1 },
  ],
  Differentiation: [
    { topic: 'Differentiation', text: 'Given y = 3x³ − 4x² + 5x − 2, find dy/dx.', solution: 'Using the power rule, dy/dx = 9x² − 8x + 5.', method: 2, accuracy: 1 },
    { topic: 'Differentiation', text: 'Find the gradient of the curve y = x² + 3x at x = 2.', solution: 'dy/dx = 2x + 3. At x = 2, the gradient is 7.', method: 2, accuracy: 1 },
  ],
};
export function makeQuestions(selected: string[], count: number) {
  return Array.from({ length: count }, (_, i) => ({ ...questionBank[selected[i % selected.length]][Math.floor(i / selected.length) % 2], id: crypto.randomUUID() }));
}
export const initialPapers: Paper[] = [
  { id: 'p1', title: 'Quadratic equations & functions', level: 'Secondary 3', subject: 'Elementary Mathematics', topics: topics.slice(0, 2), difficulty: 'Balanced', duration: 45, questions: makeQuestions(topics.slice(0, 2), 4), approved: true },
  { id: 'p2', title: 'Trigonometry: practice paper', level: 'Secondary 4', subject: 'Elementary Mathematics', topics: ['Trigonometry'], difficulty: 'Balanced', duration: 40, questions: makeQuestions(['Trigonometry'], 2), approved: true },
  { id: 'p3', title: 'Differentiation fundamentals', level: 'Secondary 4', subject: 'Additional Mathematics', topics: ['Differentiation'], difficulty: 'Balanced', duration: 30, questions: makeQuestions(['Differentiation'], 2), approved: true },
  { id: 'p4', title: 'Coordinate geometry checkpoint', level: 'Secondary 3', subject: 'Additional Mathematics', topics: ['Coordinate geometry'], difficulty: 'Balanced', duration: 30, questions: makeQuestions(['Coordinate geometry'], 2), approved: true },
  { id: 'p5', title: 'Statistics: measures of central tendency', level: 'Secondary 3', subject: 'Elementary Mathematics', topics: ['Statistics'], difficulty: 'Balanced', duration: 30, questions: makeQuestions(['Statistics'], 2), approved: true },
  { id: 'p6', title: 'Algebra essentials', level: 'Secondary 3', subject: 'Elementary Mathematics', topics: ['Algebraic expressions'], difficulty: 'Balanced', duration: 30, questions: makeQuestions(['Algebraic expressions'], 2), approved: false },
];
export const initialAssignments: Assignment[] = [
  { id: 'MM-QF26', paperId: 'p1', title: initialPapers[0].title, className: classes[0], due: '2026-09-12', submitted: 10, total: 12, status: 'Active', review: 3 },
  { id: 'MM-TR26', paperId: 'p2', title: initialPapers[1].title, className: classes[1], due: '2026-09-13', submitted: 8, total: 12, status: 'Active', review: 2 },
  { id: 'MM-DF26', paperId: 'p3', title: initialPapers[2].title, className: classes[3], due: '2026-09-14', submitted: 9, total: 12, status: 'Active', review: 2 },
  { id: 'MM-CG26', paperId: 'p4', title: initialPapers[3].title, className: classes[2], due: '2026-09-15', submitted: 11, total: 12, status: 'Active', review: 1 },
  { id: 'MM-ST26', paperId: 'p5', title: initialPapers[4].title, className: classes[0], due: '2026-09-07', submitted: 12, total: 12, status: 'Released', review: 0 },
];
const names = ['Chloe Tan', 'Ethan Lim', 'Aisha Rahman', 'Ryan Lee', 'Isabelle Ng', 'Lucas Wong', 'Sofia Ahmad', 'Daniel Koh', 'Olivia Chen', 'Arjun Nair', 'Emma Goh', 'Zachary Teo'];
const otherNames = ['Amelia', 'Benjamin', 'Charlotte', 'Dylan', 'Emily', 'Felix', 'Grace', 'Hannah', 'Isaac', 'Jasmine', 'Kai', 'Leah'];
export const students = classes.flatMap((className, c) => names.map((name, i) => ({ id: `S${301 + c * 12 + i}`, name: c === 0 ? name : `${otherNames[(i + c * 3) % 12]} ${name.split(' ').slice(1).join(' ')}`, className, score: 55 + ((i * 7 + c * 11) % 40), change: 2 + i % 9, gap: topics[(i + c) % topics.length] })));
export const initialReviews: Review[] = initialAssignments.flatMap((a, n) => Array.from({ length: a.review }, (_, i) => {
  const student = students.filter(s => s.className === a.className)[i];
  return { id: `r${n}-${i}`, name: student.name, code: student.id, assignmentId: a.id, flagged: i === 0, approved: false, marks: initialPapers[n].questions.map((_, q) => ({ method: 2, accuracy: i === 0 && q === 0 ? 0 : 1, feedback: i === 0 && q === 0 ? 'Your method is correct. Check the final arithmetic and the signs in your answer.' : 'Clear working and a correct answer. Keep showing each step of your method.', checked: false })) };
}));
export const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('');
export const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
