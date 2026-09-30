import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { TutorClass } from '../types/classes';

type Props = {
  classes: TutorClass[];
  assigned: string[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
};

export function ClassSelect({ classes, assigned, selected, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState({ maxHeight: 260, above: false });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const summary = selected.length === 1 ? classes.find(item => item.id === selected[0])?.name
    : selected.length ? selected.length + ' classes selected'
      : classes.every(item => assigned.includes(item.id)) ? 'All classes already assigned' : 'Select classes';

  useLayoutEffect(() => {
    if (!open) return;
    const field = root.current;
    const modal = field?.closest('.modal');
    if (!field || !modal) return;
    // Keep the menu inside the visible dialog so it cannot enlarge its scroll area.
    const position = () => {
      const fieldBounds = field.getBoundingClientRect();
      const modalBounds = modal.getBoundingClientRect();
      const below = Math.min(modalBounds.bottom, window.innerHeight) - fieldBounds.bottom - 12;
      const above = fieldBounds.top - Math.max(modalBounds.top, 0) - 12;
      const openAbove = below < 160 && above > below;
      setMenuLayout({ maxHeight: Math.max(0, Math.min(260, openAbove ? above : below)), above: openAbove });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(modal);
    window.addEventListener('resize', position);
    modal.addEventListener('scroll', position, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      modal.removeEventListener('scroll', position);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return <div className="assignment-class-select" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true });
      }
    }}>
    <span id={id + '-label'} className="assignment-class-label">Assign to classes</span>
    <button ref={trigger} type="button" className="assignment-class-trigger" disabled={disabled}
      aria-labelledby={id + '-label ' + id + '-summary'} aria-expanded={open} aria-controls={id + '-options'}
      onClick={() => setOpen(value => !value)}>
      <span id={id + '-summary'}>{summary}</span><ChevronDown size={16} />
    </button>
    {open && <div id={id + '-options'} className="assignment-class-menu" role="group" aria-label="Available classes"
      data-side={menuLayout.above ? 'above' : 'below'} style={{ maxHeight: menuLayout.maxHeight }}>
      {classes.map(item => {
        const alreadyAssigned = assigned.includes(item.id);
        const checked = alreadyAssigned || selected.includes(item.id);
        return <button key={item.id} type="button" role="checkbox" aria-checked={checked}
          disabled={disabled || alreadyAssigned || (!checked && selected.length >= 50)}
          onClick={() => onChange(checked ? selected.filter(value => value !== item.id) : [...selected, item.id])}>
          <span className="assignment-class-check" aria-hidden="true">{checked && <Check size={13} strokeWidth={2.5} />}</span>
          <span className="assignment-class-description"><strong>{item.name}</strong><small>{item.subject} / Secondary {item.school_year} / {item.subject_level}</small>
            {alreadyAssigned && <small className="assignment-class-assigned">Already assigned</small>}</span>
        </button>;
      })}
    </div>}
  </div>;
}
