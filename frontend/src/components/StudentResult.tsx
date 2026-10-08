import { useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { getStudentResult } from '../api/studentAssignments';
import { singaporeDate } from '../lib/assignmentStatus';
import { useRemoteData } from '../lib/useRemoteData';

const marks = (total: { earned: number; available: number }) => `${total.earned} / ${total.available}`;

// UC12: the same link and code show a pending status until the tutor releases the result.
export function StudentResult({ token, code }: { token: string; code: string }) {
  const load = useCallback((signal: AbortSignal) => getStudentResult(token, code, signal), [token, code]);
  const { data, loading, error, reload } = useRemoteData(load);
  const retry = <button type="button" className="btn secondary" disabled={loading} onClick={reload}>
    <RefreshCw size={15} />{loading ? 'Checking...' : 'Check again'}</button>;

  if (loading && !data) return <div className="student-result" role="status">Checking for your result...</div>;
  if (error) return <div className="student-result">
    <p>Your result could not be loaded. Nothing is shown until it loads in full.</p>{retry}</div>;
  if (!data || data.status !== 'released') return <div className="student-result">
    <h2>Your tutor is reviewing your work</h2>
    <p>Your marks and feedback appear here once your tutor releases them. Open this link again later.</p>{retry}</div>;

  const { result } = data;
  const percent = result.available ? Math.round(100 * result.earned / result.available) : 0;
  return <section className="student-result released" aria-labelledby="student-result-heading">
    <h2 id="student-result-heading">Your result</h2>
    <p className="student-result-score"><strong>{marks(result)}</strong><span>{percent}%</span></p>
    <dl className="student-result-split">
      <div><dt>Method marks</dt><dd>{marks(result.method)}</dd></div>
      <div><dt>Accuracy marks</dt><dd>{marks(result.accuracy)}</dd></div>
    </dl>
    <ol className="student-result-questions">{result.questions.map(question =>
      <li key={question.number}>
        <h3><span>Question {question.number}</span><span>{marks(question)}</span></h3>
        {question.parts.map((part, index) => <div key={index} className="student-result-part">
          {part.label && <h4>Part {part.label}</h4>}
          <ul className="student-result-marks" aria-label={'Marks for question ' + question.number + (part.label ? ' part ' + part.label : '')}>
            {part.marks.map((mark, i) => <li key={i} className={mark.awarded === mark.max_marks ? 'full' : ''}>
              <strong>{mark.code}</strong> {mark.awarded} / {mark.max_marks}</li>)}
          </ul>
          {part.feedback && <p>{part.feedback}</p>}
        </div>)}
      </li>)}
    </ol>
    <p className="field-hint">Released by your tutor {singaporeDate(data.released_at)}. M marks are for method; A and B marks are for accuracy.</p>
  </section>;
}
