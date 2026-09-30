import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Paper, Question } from '../data';
import { questionMarks } from '../lib/paperQuestions';
import { QuestionBlocks } from './QuestionContent';
import './ExamPaper.css';
import { HandwritingArea } from './HandwritingArea';
import type { InkDrawing, InkStroke, InkTool } from '../lib/useHandwriting';

type Handwriting = { drawing: InkDrawing; tool: InkTool; onChange: (area: string, strokes: InkStroke[]) => void };

type PaperView = 'questions' | 'solutions';

type ExamPaperProps = {
  paper: Paper;
  view: PaperView;
  handwriting?: Handwriting;
};

function AnswerSpace({ marks, label, area, description, handwriting }: { marks: number; label?: string | null; area: string; description: string; handwriting?: Handwriting }) {
  return <div className="exam-answer-space" data-answer-area={area}>
    <div className="exam-working-space" style={{ minHeight: `${Math.max(3, Math.min(marks + 1, 8)) * 28}px` }} aria-hidden="true" />
    <div className="exam-answer-line">
      <span>Answer {label}</span><span className="exam-answer-dots" aria-hidden="true" /><span>[{marks}]</span>
    </div>
    {handwriting && <HandwritingArea key={`${area}:${handwriting.tool}`} label={description}
      strokes={handwriting.drawing[area] ?? []} tool={handwriting.tool}
      onChange={strokes => handwriting.onChange(area, strokes)} />}
  </div>;
}

function ExamQuestion({ question, number, handwriting }: { question: Question; number: number; handwriting?: Handwriting }) {
  const bank = question.bankQuestion;
  const content = bank?.question_content ?? question.content;
  return <article className="exam-question question-card" aria-label={`Question ${number}`}>
    <span className="exam-question-number">{number}</span>
    <div className="exam-question-body">
      {content ? <>
        <QuestionBlocks blocks={content.shared_blocks} />
        {content.parts.map(part => {
          const marks = bank?.marking_rubric.parts.find(rubric => rubric.part_id === part.id)
            ?.marking_points.reduce((sum, point) => sum + point.max_marks, 0) ?? question.marksByPart?.[part.id] ?? 0;
          return <div className="exam-question-part" key={part.id}>
            <div className={`exam-part-prompt ${part.label ? 'has-label' : ''}`}>
              {part.label && <span className="exam-part-label">{part.label}</span>}
              <QuestionBlocks blocks={part.blocks} />
            </div>
            <AnswerSpace marks={marks} label={part.label} area={JSON.stringify([question.id, part.id])}
              description={`Writing space for question ${number}${part.label ? ` ${part.label}` : ''}`} handwriting={handwriting} />
          </div>;
        })}
      </> : <><p>{question.text}</p><AnswerSpace marks={questionMarks(question)} area={JSON.stringify([question.id, 'main'])}
        description={`Writing space for question ${number}`} handwriting={handwriting} /></>}
    </div>
  </article>;
}

function MarkingQuestion({ question, number }: { question: Question; number: number }) {
  const bank = question.bankQuestion;
  const parts = bank ? bank.question_content.parts.map(part => ({
    id: part.id,
    label: part.label,
    steps: bank.solution.parts.find(solution => solution.part_id === part.id)?.worked_solution ?? [],
    points: bank.marking_rubric.parts.find(rubric => rubric.part_id === part.id)?.marking_points ?? [],
  })) : [{
    id: 'main', label: null, steps: [question.solution],
    points: [
      { id: 'method', code: `M${question.method}`, max_marks: question.method, criterion: 'Correct method and intermediate steps.' },
      { id: 'accuracy', code: `A${question.accuracy}`, max_marks: question.accuracy, criterion: 'Correct final answer.' },
    ].filter(point => point.max_marks > 0),
  }];

  return <article className="exam-marking-question solution-box" aria-label={`Marking guide for question ${number}`}>
    <h3>Question {number} <span>[{questionMarks(question)} marks]</span></h3>
    <table className="exam-marking-table">
      <thead><tr><th scope="col">Part</th><th scope="col">Worked solution</th><th scope="col">Marks &amp; remarks</th></tr></thead>
      <tbody>{parts.map(part => <tr key={part.id}>
        <th scope="row">{part.label || number}</th>
        <td>{part.steps.map((step, i) => <p key={i}>{step}</p>)}</td>
        <td><ul className="marking-points">{part.points.map(point => <li key={point.id}>
          <strong>{point.code}</strong>: {point.criterion} <span>({point.max_marks} {point.max_marks === 1 ? 'mark' : 'marks'})</span>
        </li>)}</ul></td>
      </tr>)}</tbody>
    </table>
  </article>;
}

function PageFooter({ paper, page, total }: { paper: Paper; page: number; total: number }) {
  return <footer className="exam-page-footer"><span>MethodMark &middot; {paper.subject}</span><span>{page} / {total}</span></footer>;
}

function CoverPage({ paper, totalPages }: { paper: Paper; totalPages: number }) {
  const totalMarks = paper.questions.reduce((sum, question) => sum + questionMarks(question), 0);
  return <section className="exam-sheet exam-cover" aria-label="Practice paper cover">
    <header className="exam-cover-brand"><span className="exam-brand">METHODMARK</span><span className="exam-series">PRACTICE PAPER</span></header>
    <div className="exam-cover-title"><h2>{paper.title}</h2><p>{paper.level}</p></div>
    <div className="exam-candidate-details" aria-label="Student details to complete on the paper">
      <div className="exam-name-field"><span>Name</span><span className="exam-field-line" /></div>
      <div><span>Class</span><span className="exam-field-line" /></div>
      <div><span>Index no.</span><span className="exam-field-line" /></div>
      <div><span>Date</span><span className="exam-field-line" /></div>
    </div>
    <div className="exam-subject-band"><div><h3>{paper.subject}</h3><p>Question booklet</p></div><div><strong>{paper.duration} minutes</strong><span>{totalMarks} marks</span></div></div>
    <section className="exam-instructions" aria-labelledby="exam-instructions-heading">
      <h3 id="exam-instructions-heading">READ THESE INSTRUCTIONS FIRST</h3>
      <p>Write your name, class and index number in the spaces above.</p>
      <p>Answer <strong>all {paper.questions.length} questions</strong>.</p>
      <p>Write your answers in the spaces provided. Show all necessary working clearly.</p>
      <p>The number of marks is given in brackets [ ] at the end of each question or part question.</p>
      <p>Scientific calculators may be used.</p>
      <p>The total number of marks for this paper is <strong>{totalMarks}</strong>.</p>
    </section>
    <div className="exam-cover-bottom"><div className="exam-score-box"><strong>FOR TUTOR'S USE</strong><div><span>Total</span><span className="exam-score-blank" /><b>/ {totalMarks}</b></div></div><p>This paper consists of {totalPages} printed pages.</p></div>
    <PageFooter paper={paper} page={1} total={totalPages} />
  </section>;
}

export function ExamPaper({ paper, view, handwriting }: ExamPaperProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>(() => [paper.questions.map((_, index) => index)]);
  const coverPages = view === 'questions' ? 1 : 0;
  const totalPages = pages.length + coverPages;

  // Measure the actual rendered content, including diagrams, to pack complete
  // questions onto sheets. Recalculate for resized windows and loaded fonts.
  useLayoutEffect(() => {
    const root = documentRef.current;
    if (!root) return;
    let disposed = false;
    const paginate = () => {
      if (disposed) return;
      const pageBody = root.querySelector<HTMLElement>('.exam-page-items');
      if (!pageBody) return;
      const availableHeight = parseFloat(getComputedStyle(pageBody).minHeight);
      const items = root.querySelectorAll<HTMLElement>('[data-exam-item]');
      const next: number[][] = [];
      let current: number[] = [];
      let used = 0;
      items.forEach(item => {
        const height = Math.ceil(item.getBoundingClientRect().height);
        if (current.length && used + height > availableHeight) {
          next.push(current);
          current = [];
          used = 0;
        }
        current.push(Number(item.dataset.examItem));
        used += height;
      });
      if (current.length) next.push(current);
      if (next.length) setPages(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(paginate);
    observer.observe(root);
    const pageBody = root.querySelector<HTMLElement>('.exam-page-items');
    if (pageBody) observer.observe(pageBody);
    const beforePrint = () => flushSync(paginate);
    window.addEventListener('beforeprint', beforePrint);
    root.addEventListener('load', paginate, true);
    void document.fonts.ready.then(paginate);
    paginate();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('beforeprint', beforePrint);
      root.removeEventListener('load', paginate, true);
    };
  }, [paper, view]);

  return <div className={`exam-document exam-${view}`} ref={documentRef}>
    {view === 'questions' && <CoverPage paper={paper} totalPages={totalPages} />}
    {pages.map((indices, pageIndex) => <section className="exam-sheet exam-content-sheet" key={pageIndex} aria-label={`${view === 'questions' ? 'Question paper' : 'Marking guide'} page ${pageIndex + 1 + coverPages}`}>
      <header className="exam-running-header"><span>{paper.title}</span><span>{view === 'questions' ? paper.subject : 'SOLUTIONS & MARKING GUIDE'}</span></header>
      <p className="exam-section-caption">{view === 'questions' ? 'Answer all the questions.' : 'Worked solutions and marking criteria'}</p>
      <div className="exam-page-items">{indices.map(index => {
        const question = paper.questions[index];
        return <div data-exam-item={index} key={question.id}>
          {view === 'questions' ? <ExamQuestion question={question} number={index + 1} handwriting={handwriting} /> : <MarkingQuestion question={question} number={index + 1} />}
        </div>;
      })}</div>
      {pageIndex === pages.length - 1 && <div className="exam-end-note">{view === 'questions' ? 'END OF PAPER' : 'END OF MARKING GUIDE'}</div>}
      <PageFooter paper={paper} page={pageIndex + 1 + coverPages} total={totalPages} />
    </section>)}
  </div>;
}
