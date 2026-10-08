import { randomColour } from './colours';
import type { Paper, Question } from '../data';
import type { BankQuestion, ContentBlock } from '../types/questionBank';

export const MAX_PAPER_QUESTIONS = 30;

const blockText = (blocks: ContentBlock[]) => blocks
  .map(block => block.type === 'text' ? block.text : block.alt_text)
  .join('\n');

export function toPaperQuestion(bankQuestion: BankQuestion): Question {
  const points = bankQuestion.marking_rubric.parts.flatMap(part => part.marking_points);
  const marksFor = (prefix: string) => points
    .filter(point => point.code.startsWith(prefix))
    .reduce((total, point) => total + point.max_marks, 0);

  return {
    id: bankQuestion.id,
    topic: bankQuestion.topics.join(' / '),
    text: [
      blockText(bankQuestion.question_content.shared_blocks),
      ...bankQuestion.question_content.parts.map(part =>
        [part.label, blockText(part.blocks)].filter(Boolean).join(' ')),
    ].filter(Boolean).join('\n'),
    solution: bankQuestion.solution.parts.map(solution => {
      const part = bankQuestion.question_content.parts.find(part => part.id === solution.part_id);
      return [part?.label, ...solution.worked_solution].filter(Boolean).join('\n');
    }).join('\n\n'),
    method: marksFor('M'),
    accuracy: marksFor('A'),
    bankQuestion,
  };
}

export function questionMarks(question: Question): number {
  return question.bankQuestion
    ? question.bankQuestion.marking_rubric.parts.flatMap(part => part.marking_points)
      .reduce((total, point) => total + point.max_marks, 0)
    : question.marksByPart ? Object.values(question.marksByPart).reduce((sum, marks) => sum + marks, 0)
      : question.method + question.accuracy;
}

export function createSamplePaper(bank: BankQuestion[], title: string, duration: number): Paper {
  if (bank.length > MAX_PAPER_QUESTIONS) throw new Error(`A paper can contain at most ${MAX_PAPER_QUESTIONS} questions.`);
  const levels = [...new Set(bank.map(question => `Secondary ${question.school_year} (${question.subject_level})`))];
  return {
    id: crypto.randomUUID(),
    color: randomColour(),
    title: title.trim() || 'Question bank practice',
    level: levels.length === 1 ? levels[0] : 'Mixed levels',
    subject: [...new Set(bank.map(question => question.subject))].join(' / '),
    topics: [...new Set(bank.flatMap(question => question.topics))],
    difficulty: [...new Set(bank.map(question => question.difficulty))].join(' / '),
    duration,
    questions: bank.map(toPaperQuestion),
    approved: false,
  };
}
