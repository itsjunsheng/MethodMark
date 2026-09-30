import { useCallback, useState } from 'react';
import { getGrading, saveReview } from '../api/grading';
import type { GradingDetail, QueueItem, ReviewDraft } from '../types/grading';
import { useRemoteData } from '../lib/useRemoteData';
import { Modal } from './Modal';
import { QuestionPrompt } from './QuestionContent';
import { HandwritingArea } from './HandwritingArea';
import { useToast } from './Toast';
import './StudentPaper.css';

export function GradingReview({ item, onClose, onSaved }: { item: QueueItem; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const load = useCallback((signal: AbortSignal) => getGrading(item.submission_id, signal), [item.submission_id]);
  const { data, loading, error, reload } = useRemoteData(load);
  return <Modal title={item.student_name || item.student_code} subtitle={item.paper_title + ' / ' + item.class_name}
    className="grading-review-modal" onClose={() => { if (!saving) onClose(); }} wide>
    {loading ? <p className="grading-empty" role="status">Loading assessment and original work...</p>
      : error ? <div className="grading-empty"><p>Unable to load this assessment.</p><button className="btn secondary" onClick={reload}>Try again</button></div>
        : data && <ReviewEditor key={data.job.submission_id} data={data} onSaved={onSaved} saving={saving} setSaving={setSaving} />}
  </Modal>;
}

function initialDraft(data: GradingDetail): ReviewDraft {
  return data.job.review_draft ?? { questions: (data.job.result?.questions ?? []).map(q => ({ question_id: q.question_id,
    parts: q.parts.map(part => ({ part_id: part.part_id, checked: false, feedback: part.feedback,
      points: part.points.map(point => ({ point_id: point.id, awarded: point.awarded })) })) })) };
}
function ReviewEditor({ data, onSaved, saving, setSaving }: { data: GradingDetail; onSaved: () => void; saving: boolean; setSaving: (value: boolean) => void }) {
  const [draft, setDraft] = useState(() => initialDraft(data));
  const [version, setVersion] = useState(data.job.version);
  const [index, setIndex] = useState(0);
  const toast = useToast();
  const question = data.job.result?.questions[index];
  const source = data.paper.questions.find(q => q.id === question?.question_id);
  const reviewed = draft.questions.find(q => q.question_id === question?.question_id);
  const allPoints = draft.questions.flatMap(q => q.parts.flatMap(part => part.points));
  const total = allPoints.reduce((sum, point) => sum + (point.awarded ?? 0), 0);
  const maximum = data.job.result?.questions.reduce((sum, q) => sum + q.parts.reduce((n, p) => n + p.points.reduce((m, x) => m + x.max_marks, 0), 0), 0) ?? 0;
  const unassessed = allPoints.filter(point => point.awarded === null).length;
  function change(partId: string, update: (part: ReviewDraft['questions'][number]['parts'][number]) => ReviewDraft['questions'][number]['parts'][number]) {
    setDraft(current => ({ questions: current.questions.map(q => q.question_id !== question?.question_id ? q : {
      ...q, parts: q.parts.map(p => p.part_id === partId ? update(p) : p),
    }) }));
  }
  async function save() {
    setSaving(true);
    try { const saved = await saveReview(data.job.submission_id, version, draft); setVersion(saved.version); onSaved(); toast.success('Review draft saved. Results remain private.'); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not save this review.'); }
    finally { setSaving(false); }
  }
  return <>
    <div className="grading-review-summary"><span>Provisional marks <strong>{total} / {maximum}</strong>{unassessed > 0 && ' / ' + unassessed + ' unassessed points'}</span>
      <button className="btn primary" disabled={saving || !question} onClick={() => void save()}>{saving ? 'Saving...' : 'Save review draft'}</button></div>
    {data.manual_error && <p className="grading-empty">{data.manual_error}</p>}
    <div className="grading-question-tabs" role="group" aria-label="Questions">
      {data.job.result?.questions.map((q, i) => <button key={q.question_id} aria-pressed={i === index} onClick={() => setIndex(i)}>Question {q.number}{q.parts.some(p => p.flags.length) && <span title="Flagged for review"> *</span>}</button>)}
    </div>
    {question && source && reviewed && <div className="grading-review-columns">
      <section className="grading-original"><h3>Original submission</h3><QuestionPrompt question={source} />
        {question.parts.map(part => {
          const area = JSON.stringify([question.question_id, part.part_id]);
          const strokes = data.submission.drawing[area] ?? [];
          const size = data.submission.drawing_sizes?.[area] ?? [624, Math.max(3, Math.min(part.points.reduce((sum, p) => sum + p.max_marks, 0) + 1, 8)) * 28 + 32];
          return strokes.length > 0 && <div key={part.part_id}><h4>Working {part.label}</h4>
            <div className="grading-ink" style={{ aspectRatio: size[0] / size[1] }}>
              <HandwritingArea label={'Submitted working ' + (part.label || question.number)} strokes={strokes} tool="scroll" onChange={() => {}} />
            </div></div>;
        })}
        {data.photos.map((photo, i) => <figure key={photo.url}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={'Submitted photo ' + (i + 1)} /></a><figcaption>Photo {i + 1} / Open to enlarge</figcaption></figure>)}
        {!data.photos.length && !question.parts.some(p => data.submission.drawing[JSON.stringify([question.question_id, p.part_id])]?.length) && <p>No working submitted for this question.</p>}
      </section>
      <section className="grading-decisions"><h3>Rubric &amp; review</h3>
        {question.parts.map(part => {
          const review = reviewed.parts.find(p => p.part_id === part.part_id)!;
          const solution = source.bankQuestion?.solution.parts.find(p => p.part_id === part.part_id);
          return <fieldset key={part.part_id} disabled={saving} className="grading-part"><legend>{part.label || 'Question ' + question.number}</legend>
            {!!part.flags.length && <ul className="grading-flags">{part.flags.map((flag, i) => <li key={i}>{flag}</li>)}</ul>}
            <details open={!!part.flags.length}><summary>AI transcription / {Math.round(part.confidence * 100)}% reading confidence</summary><pre>{part.transcription || 'No readable working identified.'}</pre><small>Model-reported confidence; verify against the original.</small></details>
            <details><summary>Worked solution</summary>{solution?.worked_solution.map((step, i) => <p key={i}>{step}</p>)}</details>
            {part.points.map(point => {
              const award = review.points.find(p => p.point_id === point.id)!;
              return <div className="grading-point" key={point.id}>
                <label><span><strong>{point.code}</strong> {point.criterion}</span><span className="grading-score-input">
                  <input aria-label={'Marks for ' + part.part_id + ' ' + point.id} type="number" min={0} max={point.max_marks} step={1}
                    placeholder="?" value={award.awarded ?? ''} onChange={event => {
                      const value = event.target.value === '' ? null : Number(event.target.value);
                      if (value !== null && (!Number.isInteger(value) || value < 0 || value > point.max_marks)) return;
                      change(part.part_id, p => ({ ...p, checked: false, points: p.points.map(x => x.point_id === point.id ? { ...x, awarded: value } : x) }));
                    }} /><small>/ {point.max_marks}</small></span></label>
                <p>{point.rationale}</p>{point.evidence && <blockquote>{point.evidence}</blockquote>}
                <small>{data.job.vision_model ? 'AI proposal' : 'Unassessed'}: {point.awarded ?? 'Unassessed'} / {Math.round(point.confidence * 100)}% confidence</small>
              </div>;
            })}
            <label>Feedback<textarea aria-label={'Feedback for ' + part.part_id} rows={3} maxLength={4000} value={review.feedback}
              onChange={event => change(part.part_id, p => ({ ...p, checked: false, feedback: event.target.value }))} /></label>
            <label className="check-label"><input type="checkbox" checked={review.checked} disabled={review.points.some(p => p.awarded === null)}
              onChange={event => change(part.part_id, p => ({ ...p, checked: event.target.checked }))} />I have checked this part.</label>
          </fieldset>;
        })}
      </section>
    </div>}
    <p className="grading-private">Draft review only. Marks and feedback are not released to students.</p>
  </>;
}
