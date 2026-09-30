import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = { options: string[]; selected: string[]; disabled: boolean; onChange: (topics: string[]) => void };

export function TopicSelect({ options, selected, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const summary = !selected.length ? 'Select topics' : selected.length === options.length ? 'All topics'
    : selected.length === 1 ? selected[0] : `${selected.length} topics selected`;
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return <div className="topics-select" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
    <span id={`${id}-label`} className="builder-field-label">Topics <span className="optional">optional</span></span>
    <button ref={trigger} type="button" className="topics-select-trigger" disabled={disabled}
      aria-labelledby={`${id}-label ${id}-summary`} aria-expanded={open} aria-controls={`${id}-options`}
      onClick={() => setOpen(value => !value)}>
      <span id={`${id}-summary`} title={selected.join(', ') || summary}>{summary}</span><ChevronDown size={15} />
    </button>
    {open && <div id={`${id}-options`} className="topics-select-menu" role="group" aria-label="Available topics">
      <div className="topics-select-options">{options.map(topic => <label key={topic}>
        <input type="checkbox" checked={selected.includes(topic)} onChange={event =>
          onChange(event.target.checked ? [...selected, topic] : selected.filter(value => value !== topic))} />
        <span>{topic}</span>
      </label>)}</div>
      <div className="topics-select-actions">
        <button type="button" onClick={() => onChange(options)}>Select all</button>
        <button type="button" onClick={() => onChange([])}>Clear all</button>
      </div>
    </div>}
  </div>;
}
