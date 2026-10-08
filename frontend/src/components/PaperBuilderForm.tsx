import { useToast, useToastError } from './Toast';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, CheckCircle2, FileText, Sparkles } from 'lucide-react';
import type { Paper } from '../data';
import type { BankQuestion } from '../types/questionBank';
import { fetchQuestions } from '../api/questions';
import { createSamplePaper } from '../lib/paperQuestions';
import { TopicSelect } from './TopicSelect';
import './PaperBuilderForm.css';

const difficulties = ['easy', 'medium', 'hard'] as const;

export function PaperBuilderForm({ onClose, onSave }: { onClose: () => void; onSave: (paper: Paper) => Promise<void> }) {
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  useToastError(loadError);
  const [attempt, setAttempt] = useState(0);
  const [subject, setSubject] = useState('');
  const [schoolYear, setSchoolYear] = useState('');
  const [subjectLevel, setSubjectLevel] = useState('');
  // null selects every available topic; an empty array is an explicit Clear all.
  const [selectedTopics, setSelectedTopics] = useState<string[] | null>(null);
  const [difficulty, setDifficulty] = useState<BankQuestion['difficulty']>('medium');
  const [questionCount, setQuestionCount] = useState('');
  const [duration, setDuration] = useState(45);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // The sample bank is loaded once per open so all choices come from the same data.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError('');
    const timeout = window.setTimeout(() => controller.abort('timeout'), 30000);
    void fetchQuestions(controller.signal).then(questions => {
      if (!active) return;
      setBank(questions);
      if (!questions.length) setLoadError('Your question bank is empty. Add questions, then try again.');
    }).catch(error => {
      if (!active) return;
      setLoadError(controller.signal.reason === 'timeout'
        ? 'Loading the question bank took too long. Please try again.'
        : error instanceof Error ? error.message : 'Could not load the question bank. Please try again.');
    }).finally(() => {
      window.clearTimeout(timeout);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  const subjects = [...new Set(bank.map(question => question.subject))].sort();
  const subjectQuestions = bank.filter(question => question.subject === subject);
  const schoolYears = [...new Set(subjectQuestions.map(question => question.school_year))].sort((a, b) => a - b);
  const yearQuestions = subjectQuestions.filter(question => question.school_year === Number(schoolYear));
  const subjectLevels = [...new Set(yearQuestions.map(question => question.subject_level))].sort();
  const levelQuestions = yearQuestions.filter(question => question.subject_level === subjectLevel);
  const availableTopics = [...new Set(levelQuestions.flatMap(question => question.topics))].sort();
  const topics = selectedTopics ?? availableTopics;
  const allTopicsSelected = selectedTopics === null || (topics.length > 0 && topics.length === availableTopics.length);
  const matches = levelQuestions.filter(question => question.difficulty === difficulty
    && (allTopicsSelected || question.topics.some(topic => topics.includes(topic))));
  const hasSelection = !!(subject && schoolYear && subjectLevel);
  const count = questionCount === '' ? matches.length : Number(questionCount);
  const countError = questionCount !== '' && (!Number.isInteger(count) || count < 1)
    ? 'Enter a whole number of at least 1.'
    : hasSelection && matches.length > 0 && count > matches.length
      ? `Only ${matches.length} matching ${matches.length === 1 ? 'question is' : 'questions are'} available. Choose a smaller number or broaden your selections.`
      : '';
  const canGenerate = !saving && !loading && !loadError && hasSelection && matches.length > 0 && !countError;

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!canGenerate || !Number.isInteger(duration) || duration < 10 || duration > 180) return;
    const selected = [...matches];
    // Sample without duplicates when a smaller count is requested. Keep parts together.
    if (count < selected.length) {
      for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
      }
    }
    setSaving(true); toast.dismiss();
    try { await onSave(createSamplePaper(selected.slice(0, count), title, duration)); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not save the paper. Please try again.'); }
    finally { setSaving(false); }
  };

  return <form className="modal-body builder-form" onSubmit={generate} aria-busy={loading || saving}>
    <div className="builder-content">
    {loading && <p className="builder-hint" role="status">Loading question options...</p>}
    {loadError && <div className="builder-load-error">
      <p>Question options are unavailable.</p>
      <button type="button" className="btn secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button>
    </div>}
    <fieldset className="paper-builder-fields" disabled={loading || saving || !!loadError}>
      <section className="builder-section" aria-labelledby="builder-selection-heading">
        <h3 id="builder-selection-heading" className="builder-section-title"><BookOpen size={16} />Question selection</h3>
      <div className="paper-builder-row">
        <label>Subject
          <select value={subject} required onChange={event => {
            setSubject(event.target.value); setSchoolYear(''); setSubjectLevel(''); setSelectedTopics(null);
          }}>
            <option value="" disabled>Select subject</option>
            {subjects.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>School year
          <select value={schoolYear} required disabled={!subject} onChange={event => {
            setSchoolYear(event.target.value); setSubjectLevel(''); setSelectedTopics(null);
          }}>
            <option value="" disabled>Select school year</option>
            {schoolYears.map(value => <option key={value} value={value}>Secondary {value}</option>)}
          </select>
        </label>
        <label>Subject level
          <select value={subjectLevel} required disabled={!schoolYear} onChange={event => {
            setSubjectLevel(event.target.value); setSelectedTopics(null);
          }}>
            <option value="" disabled>Select subject level</option>
            {subjectLevels.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="paper-builder-content-options">
        <TopicSelect key={`${subject}:${schoolYear}:${subjectLevel}`} options={availableTopics} selected={topics}
          disabled={!hasSelection || !availableTopics.length} onChange={setSelectedTopics} />
        <fieldset className="builder-difficulty">
          <legend>Difficulty</legend>
          <div className="difficulty-options">{difficulties.map(value => <label key={value}>
            <input type="radio" name="difficulty" value={value} checked={difficulty === value}
              onChange={() => setDifficulty(value)} />
            <span>{value[0].toUpperCase() + value.slice(1)}</span>
          </label>)}</div>
        </fieldset>
      </div>
      </section>
      <section className="builder-section" aria-labelledby="builder-details-heading">
        <h3 id="builder-details-heading" className="builder-section-title"><FileText size={16} />Paper details</h3>
      <div className="paper-builder-row paper-builder-details">
        <label><span>Paper title <span className="optional">optional</span></span>
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Weekly maths practice" maxLength={100} />
        </label>
        <label><span>Number of questions <span className="optional">optional</span></span>
          <input type="number" min={1} step={1} value={questionCount} placeholder="All matching questions"
            aria-describedby={countError ? 'builder-count-help' : undefined} aria-invalid={!!countError}
            onChange={event => setQuestionCount(event.target.value)} />
        </label>
        <label>Duration (minutes)
          <input type="number" min={10} max={180} step={1} value={Number.isNaN(duration) ? '' : duration} required
            onChange={event => setDuration(event.target.value === '' ? NaN : Number(event.target.value))} />
        </label>
      </div>
      {countError && <p id="builder-count-help" className="validation-text" role="alert">{countError}</p>}
      </section>
    </fieldset>
    </div>
    <div className="builder-footer">
    <div className="builder-readiness">
      {canGenerate && <CheckCircle2 size={17} aria-hidden="true" />}
      {hasSelection && !loading && !loadError ? <p className={`builder-availability ${matches.length ? '' : 'validation-text'}`} role="status">
      {matches.length ? `${matches.length} matching ${matches.length === 1 ? 'question' : 'questions'} available`
        : !topics.length && availableTopics.length > 0 ? 'Select at least one topic to generate a paper.'
          : 'No questions match these selections. Try another topic or difficulty.'}
      </p> : !loading && !loadError && <p className="builder-hint">Select a subject, school year and level to get started.</p>}
    </div>
    <div className="modal-actions">
      <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>Cancel</button>
      <button type="submit" className="btn primary" disabled={!canGenerate}><Sparkles size={16} />{saving ? 'Saving paper...' : 'Generate sample paper'}</button>
    </div>
    </div>
  </form>;
}
