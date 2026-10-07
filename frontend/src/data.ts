import type { ItemColour } from './lib/colours';
import type { BankQuestion } from './types/questionBank';

export type Page = 'Overview' | 'Practice papers' | 'Assignments' | 'Marking queue' | 'Classes & students' | 'Insights' | 'Settings';
export type Question = { id: string; topic: string; text: string; solution: string; method: number; accuracy: number; bankQuestion?: BankQuestion; content?: BankQuestion['question_content']; marksByPart?: Record<string, number> };
export type Paper = { id: string; color?: ItemColour; is_archived?: boolean; title: string; level: string; subject: string; topics: string[]; difficulty: string; duration: number; questions: Question[]; approved: boolean; status?: 'draft' | 'reviewed' | 'published'; instructions?: string };
export type Assignment = { id: string; paperId: string; title: string; className: string; due: string; submitted: number; total: number; status: 'Active' | 'Released' | 'Draft'; review: number; paperSnapshot?: Paper };
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
export const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('');
