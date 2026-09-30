import type { Question } from '../data';
import type { BankQuestion, ContentBlock } from '../types/questionBank';
import { toPaperQuestion } from '../lib/paperQuestions';
import './QuestionContent.css';

type QuestionProps = {
  question: Question;
  onChange?: (question: Question) => void;
};

export function QuestionBlocks({ blocks, onChange }: {
  blocks: ContentBlock[];
  onChange?: (blocks: ContentBlock[]) => void;
}) {
  return <div className="question-blocks">{blocks.map((block, index) => {
    if (block.type === 'diagram') {
      // SVG in an image context cannot execute scripts or interact with the page.
      return <img key={index} className="question-diagram" alt={block.alt_text}
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(block.source)}`} />;
    }
    return onChange
      ? <label key={index}>Question text<textarea value={block.text} onChange={event =>
        onChange(blocks.map((item, i) => i === index ? { ...block, text: event.target.value } : item))} /></label>
      : <p key={index}>{block.text}</p>;
  })}</div>;
}

export function QuestionPrompt({ question, onChange }: QuestionProps) {
  const bank = question.bankQuestion;
  if (!bank) return onChange
    ? <label>Question<textarea value={question.text} onChange={event => onChange({ ...question, text: event.target.value })} /></label>
    : <p>{question.text}</p>;

  const update = (content: BankQuestion['question_content']) =>
    onChange?.(toPaperQuestion({ ...bank, question_content: content }));

  return <div className="bank-question">
    <QuestionBlocks blocks={bank.question_content.shared_blocks} onChange={onChange
      ? blocks => update({ ...bank.question_content, shared_blocks: blocks }) : undefined} />
    {bank.question_content.parts.map(part => {
      const marks = bank.marking_rubric.parts.find(rubric => rubric.part_id === part.id)
        ?.marking_points.reduce((total, point) => total + point.max_marks, 0) ?? 0;
      return <div className="question-part" key={part.id}>
        {part.label && <div className="question-part-heading"><strong>{part.label}</strong><span>[{marks} marks]</span></div>}
        <QuestionBlocks blocks={part.blocks} onChange={onChange ? blocks => update({
          ...bank.question_content,
          parts: bank.question_content.parts.map(item => item.id === part.id ? { ...item, blocks } : item),
        }) : undefined} />
      </div>;
    })}
  </div>;
}

export function QuestionSolution({ question, onChange }: QuestionProps) {
  const bank = question.bankQuestion;
  return <div className="solution-box">
    <strong>Worked solution</strong>
    {bank ? bank.question_content.parts.map(part => {
      const solution = bank.solution.parts.find(solution => solution.part_id === part.id);
      const rubric = bank.marking_rubric.parts.find(rubric => rubric.part_id === part.id);
      return <div key={part.id} className="solution-part">
        {part.label && <strong>{part.label}</strong>}
        {solution && (onChange
          ? <label>Solution {part.label}<textarea value={solution.worked_solution.join('\n')} onChange={event =>
            onChange(toPaperQuestion({ ...bank, solution: { parts: bank.solution.parts.map(item =>
              item.part_id === part.id ? { ...item, worked_solution: event.target.value.split('\n') } : item) } }))} /></label>
          : solution.worked_solution.map((step, i) => <p key={i}>{step}</p>))}
        <ul className="marking-points">{rubric?.marking_points.map(point => <li key={point.id}>
          <strong>{point.code}</strong> &middot; {point.criterion} <span>({point.max_marks} {point.max_marks === 1 ? 'mark' : 'marks'})</span>
        </li>)}</ul>
      </div>;
    }) : <>
      {onChange
        ? <label>Solution<textarea value={question.solution} onChange={event => onChange({ ...question, solution: event.target.value })} /></label>
        : <p>{question.solution}</p>}
      <div className="rubric-chips"><span>M{question.method} &middot; Correct method &amp; intermediate steps</span><span>A{question.accuracy} &middot; Correct final answer</span></div>
    </>}
  </div>;
}
