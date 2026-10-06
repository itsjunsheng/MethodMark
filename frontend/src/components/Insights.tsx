import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowRight, ChartNoAxesCombined, Search, ShieldCheck, Table2 } from 'lucide-react';
import { fetchInsights } from '../api/insights';
import { useRemoteData } from '../lib/useRemoteData';
import type { Insights, InsightStatus, InsightStudent, InsightTopic, InsightTrend } from '../types/insights';
import { Modal } from './Modal';
import { useToast } from './Toast';
import './Insights.css';

const GAP = 60;
const periods = [{ label: 'All time', days: 0 }, { label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }];
export const pct = (value: number | null | undefined) => value === null || value === undefined ? '–' : `${Math.round(value)}%`;
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }) : 'No date';
const studentLabel = (student: { name: string | null; code: string }) => student.name || student.code;

function useWidth<T extends Element>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width)); });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function downloadInsightsCsv(data: Insights, name = 'methodmark-insights.csv') {
  const rows = [['Student code', 'Student', 'Class', 'Submitted', 'Fully reviewed', 'Average (%)', 'Method marks (%)', 'Answer marks (%)', 'Learning focus'],
    ...data.students.map(s => [s.code, s.name ?? '', s.class_name, s.submitted, s.reviewed, s.average ?? '', s.method_rate ?? '', s.answer_rate ?? '', s.gaps.join('; ')])];
  // Prefix formula-like cells so spreadsheet apps treat names as text.
  const cell = (value: string | number) => { const text = String(value); return '"' + (/^[=+\-@]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"'; };
  const url = URL.createObjectURL(new Blob(['﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function ChartCard({ title, subtitle, table, children, className = '' }: { title: string; subtitle: string; table?: ReactNode; children: ReactNode; className?: string }) {
  const [showTable, setShowTable] = useState(false);
  return <section className={'panel insights-card ' + className}>
    <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>
      {table && <button className="insights-table-toggle" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}><Table2 size={15} />{showTable ? 'Chart' : 'Table'}</button>}
    </div>
    {showTable ? <div className="table-scroll insights-table">{table}</div> : children}
  </section>;
}

export function TrendChart({ trend, height = 220 }: { trend: InsightTrend[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [active, setActive] = useState<number | null>(null);
  const points = trend.map((row, index) => ({ ...row, index })).filter(row => row.average !== null);
  if (!points.length) return <div className="insights-plot" ref={ref}><p className="insights-empty-note">No checked work in this period yet.</p></div>;
  const left = 38, right = 18, top = 14, bottom = 30;
  const x = (i: number) => trend.length === 1 ? (left + width - right) / 2 : left + i * (width - left - right) / (trend.length - 1);
  const y = (value: number) => top + (100 - value) / 100 * (height - top - bottom);
  const line = points.map(row => `${x(row.index)},${y(row.average!)}`).join(' ');
  const every = Math.max(1, Math.ceil(trend.length / Math.max(2, Math.floor(width / 90))));
  const shown = active === null ? null : trend[active];
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - box.left) * width / box.width;
    setActive(points.reduce((best, row) => Math.abs(x(row.index) - position) < Math.abs(x(best.index) - position) ? row : best).index);
  };
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const at = points.findIndex(row => row.index === active);
    const next = at === -1 ? points.length - 1 : Math.min(points.length - 1, Math.max(0, at + (event.key === 'ArrowRight' ? 1 : -1)));
    setActive(points[next].index);
  };
  const last = points[points.length - 1];
  return <div className="insights-plot" ref={ref}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} tabIndex={0} role="img"
      aria-label={'Average score by assignment: ' + points.map(row => `${row.title} ${pct(row.average)}`).join(', ')}
      onPointerMove={move} onPointerLeave={() => setActive(null)} onFocus={() => setActive(last.index)} onBlur={() => setActive(null)} onKeyDown={key}>
      {[0, 25, 50, 75, 100].map(value => <g key={value} className="insights-gridline"><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 8} y={y(value) + 4} textAnchor="end">{value}%</text></g>)}
      <line className="insights-gap-line" x1={left} x2={width - right} y1={y(GAP)} y2={y(GAP)} />
      {points.length > 1 && <path className="insights-area" d={`M${x(points[0].index)},${y(0)} L${line.replaceAll(' ', ' L')} L${x(last.index)},${y(0)}Z`} />}
      <polyline className="insights-line" points={line} />
      {trend.map((row, index) => index % every === 0 || index === trend.length - 1 ? <text key={row.assignment_id} className="insights-axis" x={x(index)} y={height - 8} textAnchor="middle">{shortDate(row.date)}</text> : null)}
      {active !== null && <line className="insights-crosshair" x1={x(active)} x2={x(active)} y1={top} y2={height - bottom} />}
      {points.map(row => <circle key={row.assignment_id} className="insights-dot" cx={x(row.index)} cy={y(row.average!)} r={active === row.index ? 6 : 4.5} />)}
      <text className="insights-end-label" x={Math.min(x(last.index) + 8, width - 4)} y={y(last.average!) - 10} textAnchor={x(last.index) > width - 60 ? 'end' : 'start'}>{pct(last.average)}</text>
    </svg>
    {shown && shown.average !== null && <div className="insights-tooltip" style={{ left: Math.min(Math.max(x(active!), 90), width - 90) }} role="status">
      <strong>{pct(shown.average)}</strong><span>{shown.title}</span><small>{shown.class_name} · {shortDate(shown.date)} · {shown.reviewed} of {shown.submitted} fully reviewed</small>
    </div>}
  </div>;
}

function Distribution({ bins }: { bins: Insights['distribution'] }) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const [active, setActive] = useState<number | null>(null);
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (!total) return <div className="insights-plot" ref={ref}><p className="insights-empty-note">Score spread appears once whole submissions are fully reviewed.</p></div>;
  const height = 190, top = 22, bottom = 30, max = Math.max(...bins.map(bin => bin.count));
  const slot = (width - 16) / bins.length, bar = Math.min(24, slot * .45);
  const h = (count: number) => count / max * (height - top - bottom);
  return <div className="insights-plot" ref={ref}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={'Fully reviewed submissions by score: ' + bins.map(bin => `${bin.label} ${bin.count}`).join(', ')}>
      <line className="insights-baseline" x1={8} x2={width - 8} y1={height - bottom} y2={height - bottom} />
      {bins.map((bin, index) => {
        const cx = 8 + slot * index + slot / 2, cap = height - bottom - h(bin.count);
        return <g key={bin.label} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
          <rect className="insights-hit" x={cx - slot / 2} y={0} width={slot} height={height - bottom} />
          {bin.count > 0 && <path className={'insights-column' + (active === index ? ' is-active' : '')} d={`M${cx - bar / 2},${height - bottom} V${cap + 4} q0,-4 4,-4 h${bar - 8} q4,0 4,4 V${height - bottom}Z`} />}
          <text className="insights-cap" x={cx} y={cap - 7} textAnchor="middle">{bin.count}</text>
          <text className="insights-axis" x={cx} y={height - 9} textAnchor="middle">{bin.label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function TopicBars({ topics }: { topics: InsightTopic[] }) {
  if (!topics.length) return <p className="insights-empty-note">Topic mastery appears once parts are checked.</p>;
  return <ul className="insights-topics">{topics.map(topic => {
    const low = (topic.percent ?? 0) < GAP;
    return <li key={topic.topic}>
      <div className="insights-topic-head"><span>{topic.topic}</span><strong>{pct(topic.percent)}</strong></div>
      <div className="insights-track"><span className={low ? 'is-low' : ''} style={{ width: `${Math.max(topic.percent ?? 0, 1)}%` }} /></div>
      <small>{low && <span className="insights-status-label"><AlertTriangle size={13} />Needs support</span>}{topic.earned}/{topic.available} marks · {topic.students} {topic.students === 1 ? 'student' : 'students'}{topic.below ? ` · ${topic.below} below ${GAP}%` : ''}</small>
    </li>;
  })}</ul>;
}

const stages = [
  { key: 'reviewed', label: 'Reviewed' }, { key: 'awaiting_review', label: 'Awaiting review' }, { key: 'processing', label: 'Processing' },
  { key: 'failed', label: 'Grading failed' }, { key: 'not_submitted', label: 'Not submitted' },
] as const;

function StatusBars({ status }: { status: InsightStatus[] }) {
  if (!status.length) return <p className="insights-empty-note">Publish a paper to a class to track its submissions.</p>;
  return <>
    <ul className="insights-legend" aria-label="Legend">{stages.map(stage => <li key={stage.key}><i className={'insights-swatch stage-' + stage.key} />{stage.label}</li>)}</ul>
    <ul className="insights-status">{status.map(row => {
      const total = stages.reduce((sum, stage) => sum + row[stage.key], 0);
      return <li key={row.assignment_id}>
        <div className="insights-status-head"><strong>{row.title}</strong><span>{row.class_name} · due {shortDate(row.due_at)}</span></div>
        <div className="insights-stack" aria-hidden="true">{total ? stages.map(stage => row[stage.key] > 0 && <span key={stage.key} className={'stage-' + stage.key}
          style={{ flexGrow: row[stage.key] }} title={`${stage.label}: ${row[stage.key]}`} />) : <span className="stage-not_submitted" style={{ flexGrow: 1 }} />}</div>
        <small>{stages.filter(stage => row[stage.key] > 0).map(stage => `${row[stage.key]} ${stage.label.toLowerCase()}`).join(' · ') || 'No students yet'}</small>
      </li>;
    })}</ul>
  </>;
}

function StudentDetail({ student, onClose }: { student: InsightStudent; onClose: () => void }) {
  return <Modal title={studentLabel(student)} subtitle={`${student.code} · ${student.class_name}`} onClose={onClose} className="insights-student-modal">
    <div className="modal-body">
      <div className="insights-mini-stats">
        <div><span>Average</span><strong>{pct(student.average)}</strong></div>
        <div><span>Method marks</span><strong>{pct(student.method_rate)}</strong></div>
        <div><span>Answer marks</span><strong>{pct(student.answer_rate)}</strong></div>
      </div>
      <h3>Topics compared with the class</h3>
      {student.topics.length ? <>
        <p className="insights-key"><i className="insights-key-bar" />{studentLabel(student)}<i className="insights-key-tick" />Class average</p>
        <ul className="insights-topics compact">{student.topics.map(topic => <li key={topic.topic}>
          <div className="insights-topic-head"><span>{topic.topic}</span><strong>{pct(topic.percent)} <small>class {pct(topic.class_percent)}</small></strong></div>
          <div className="insights-track"><span className={topic.percent < GAP ? 'is-low' : ''} style={{ width: `${Math.max(topic.percent, 1)}%` }} />
            {topic.class_percent !== null && <b className="insights-tick" style={{ left: `${topic.class_percent}%` }} />}</div>
          {topic.percent < GAP && <small><span className="insights-status-label"><AlertTriangle size={13} />Learning focus</span></small>}
        </li>)}</ul>
      </> : <p className="insights-empty-note">No checked work for this student yet.</p>}
      <h3>Assignments</h3>
      {student.history.length ? <ul className="insights-history">{student.history.map(item => <li key={item.assignment_id}>
        <span>{item.title}<small>{shortDate(item.date)}{item.complete ? '' : ' · partly reviewed'}</small></span><strong>{pct(item.percent)}</strong>
      </li>)}</ul> : <p className="insights-empty-note">{student.submitted ? 'Submitted work has not been checked yet.' : 'No submissions in this period.'}</p>}
    </div>
  </Modal>;
}

function Students({ students }: { students: InsightStudent[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<InsightStudent | null>(null);
  const visible = students.filter(student => [student.name, student.code, student.class_name].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="panel insights-card insights-students">
    <div className="panel-heading"><div><h2>Individual learning gaps</h2><p>Lowest averages first. Open a student to compare their topics with the class.</p></div></div>
    <div className="insights-search"><Search size={16} /><input aria-label="Search students" placeholder="Search students" value={query} onChange={event => setQuery(event.target.value)} /></div>
    {!students.length ? <p className="insights-empty-note">Students appear here once a class has an assignment.</p> : <div className="table-scroll"><table className="insights-student-table">
      <thead><tr><th>Student</th><th>Class</th><th>Submitted</th><th>Average</th><th>Method</th><th>Answer</th><th>Learning focus</th></tr></thead>
      <tbody>{visible.map(student => <tr key={student.id}>
        <td><button className="assignment-title" onClick={() => setSelected(student)}>{studentLabel(student)}<ArrowRight size={14} /></button><small>{student.code}{student.active ? '' : ' · former class member'}</small></td>
        <td>{student.class_name}</td><td>{student.submitted}</td>
        <td><strong>{pct(student.average)}</strong></td><td>{pct(student.method_rate)}</td><td>{pct(student.answer_rate)}</td>
        <td>{student.gaps.length ? <span className="insights-chips">{student.gaps.map(gap => <span key={gap}>{gap}</span>)}</span> : <span className="muted">{student.average === null ? 'No checked work' : 'On track'}</span>}</td>
      </tr>)}</tbody>
    </table>{!visible.length && <p className="insights-empty-note">No students match your search.</p>}</div>}
    {selected && <StudentDetail student={selected} onClose={() => setSelected(null)} />}
  </section>;
}

export function InsightsPage({ onReview }: { onReview: () => void }) {
  const [classId, setClassId] = useState('');
  const [days, setDays] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchInsights(signal, classId, days), [classId, days]);
  const { data, loading, error, reload } = useRemoteData(load);
  const toast = useToast();
  if (!data) return loading ? <p className="insights-loading" role="status">Loading insights...</p>
    : <div className="panel insights-empty"><p>{error || 'Unable to load insights.'}</p><button className="btn secondary" onClick={reload}>Try again</button></div>;
  const { summary } = data;
  const checked = summary.checked_parts > 0;
  return <div className={'insights-page' + (loading ? ' is-refreshing' : '')} aria-busy={loading}>
    <div className="insights-filters">
      <label>Class<select aria-label="Filter insights by class" value={classId} onChange={event => setClassId(event.target.value)}><option value="">All classes</option>{data.classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Period<select aria-label="Filter insights by period" value={days} onChange={event => setDays(Number(event.target.value))}>{periods.map(period => <option key={period.days} value={period.days}>{period.label}</option>)}</select></label>
      <span className="insights-note"><ShieldCheck size={15} />Counts only the parts you have checked</span>
      <button className="btn secondary" disabled={!data.students.length} onClick={() => { downloadInsightsCsv(data); toast.success('Insights report downloaded.'); }}><ArrowDownToLine size={16} />Export report</button>
    </div>
    {!checked && <div className="info-banner insights-banner"><ChartNoAxesCombined size={22} /><div><strong>{summary.submissions ? 'No checked work yet.' : 'No submissions yet.'}</strong>
      <p>{summary.submissions ? 'Scores, topics and learning gaps appear once you check parts in the marking queue. Tick “I have checked this part” and save the review.' : 'Publish a paper to a class. Submission progress appears here as students hand in their work.'}</p></div>
      {summary.submissions > 0 && <button className="btn primary" onClick={onReview}>Open marking queue<ArrowRight size={16} /></button>}</div>}
    <section className="insights-kpis" aria-label="Summary">
      <div className="panel insights-kpi"><span>Average score</span><strong>{pct(summary.average)}</strong><small>{checked ? `From ${summary.checked_parts} checked ${summary.checked_parts === 1 ? 'part' : 'parts'}` : 'Waiting for checked work'}</small></div>
      <div className="panel insights-kpi"><span>Method marks earned</span><strong>{pct(summary.method_rate)}</strong><small>M marks for correct working</small></div>
      <div className="panel insights-kpi"><span>Answer marks earned</span><strong>{pct(summary.answer_rate)}</strong><small>A and B marks for correct results</small></div>
      <div className="panel insights-kpi"><span>Right method, lost the answer</span><strong>{pct(summary.slips.percent)}</strong><small>{summary.slips.parts ? `${summary.slips.count} of ${summary.slips.parts} parts with both mark types` : 'No parts with both mark types yet'}</small></div>
      <div className="panel insights-kpi"><span>Review progress</span><strong>{summary.total_parts ? pct(100 * summary.checked_parts / summary.total_parts) : '–'}</strong><small>{summary.reviewed} of {summary.submissions} submissions fully reviewed</small></div>
    </section>
    <div className="insights-board">
      <ChartCard title="Score trend" subtitle="Average score per assignment. The faint line marks 60%." className="span-2"
        table={<table><thead><tr><th>Assignment</th><th>Class</th><th>Date</th><th>Average</th><th>Fully reviewed</th></tr></thead><tbody>{data.trend.map(row => <tr key={row.assignment_id}><td>{row.title}</td><td>{row.class_name}</td><td>{shortDate(row.date)}</td><td>{pct(row.average)}</td><td>{row.reviewed} / {row.submitted}</td></tr>)}</tbody></table>}>
        <TrendChart trend={data.trend} />
      </ChartCard>
      <ChartCard title="Score spread" subtitle="Fully reviewed submissions by score"
        table={<table><thead><tr><th>Score</th><th>Submissions</th></tr></thead><tbody>{data.distribution.map(bin => <tr key={bin.label}><td>{bin.label}</td><td>{bin.count}</td></tr>)}</tbody></table>}>
        <Distribution bins={data.distribution} />
      </ChartCard>
      <ChartCard title="Topic mastery" subtitle="Share of available marks earned, weakest first"
        table={<table><thead><tr><th>Topic</th><th>Score</th><th>Marks</th><th>Students below {GAP}%</th></tr></thead><tbody>{data.topics.map(topic => <tr key={topic.topic}><td>{topic.topic}</td><td>{pct(topic.percent)}</td><td>{topic.earned}/{topic.available}</td><td>{topic.below}</td></tr>)}</tbody></table>}>
        <TopicBars topics={data.topics} />
      </ChartCard>
      <section className="panel insights-card span-2"><div className="panel-heading"><div><h2>Common mistakes</h2><p>Marking points most often missed in checked work</p></div></div>
        {data.mistakes.length ? <ol className="insights-mistakes">{data.mistakes.map(mistake => <li key={mistake.paper + mistake.number + mistake.code + mistake.criterion}>
          <div className="insights-mistake-head"><span className="insights-code">{mistake.code}</span><strong>{mistake.criterion}</strong><span className="insights-rate">{mistake.missed} of {mistake.assessed} missed</span></div>
          <div className="insights-track thin"><span className="is-low" style={{ width: `${mistake.rate}%` }} /></div>
          <p>Q{mistake.number}, {mistake.paper}: {mistake.question}</p>
          <small>{mistake.topics.join(' / ')} · {mistake.students.join(', ')}{mistake.missed > mistake.students.length ? ` and ${mistake.missed - mistake.students.length} more` : ''}</small>
          {mistake.feedback.map(note => <blockquote key={note}>{note}</blockquote>)}
        </li>)}</ol> : <p className="insights-empty-note">{checked ? 'No marking points missed in checked work.' : 'Common mistakes appear once parts are checked.'}</p>}
      </section>
    </div>
    <section className="panel insights-card"><div className="panel-heading"><div><h2>Submission status</h2><p>Every assignment in this period, by student</p></div></div><StatusBars status={data.status} /></section>
    <Students key={classId + ':' + days} students={data.students} />
  </div>;
}
