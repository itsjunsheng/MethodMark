import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, Check, Ellipsis, Trash2 } from 'lucide-react';
import { colours, getColour } from '../lib/colours';
import type { ItemColour } from '../lib/colours';
import { useToast } from './Toast';

export type ItemActions = {
  onColour: (colour: ItemColour) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => void;
};

type Props = ItemActions & { title: string; colour?: ItemColour; archived?: boolean; kind: 'paper' | 'class' };

export function ItemMenu({ title, colour, archived, kind, onColour, onArchive, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 300 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const toast = useToast();
  const label = 'Options for ' + title;

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = panel.current?.scrollHeight ?? 260;
      const below = innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upwards = below < height && above > below;
      const maxHeight = Math.max(0, upwards ? above : below);
      setPosition({ left: Math.max(12, Math.min(rect.right - 232, innerWidth - 244)),
        top: upwards ? rect.top - Math.min(height, maxHeight) - 8 : rect.bottom + 8, maxHeight });
    };
    place();
    panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [open]);

  async function run(action: () => Promise<void>, message: string) {
    if (saving) return;
    setSaving(true);
    try { await action(); close(); toast.success(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save this change. Please try again.'); }
    finally { setSaving(false); }
  }

  return <>
    <button ref={trigger} type="button" className="item-menu-trigger" aria-label={label} title={label}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}><Ellipsis size={20} /></button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={label} className="item-menu" style={position}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <span className="item-menu-label">Card colour</span>
      <div className="item-menu-colours" role="group" aria-label="Card colour">
        {colours.map(option => <button key={option.value} type="button" title={option.label} aria-label={option.label}
          aria-pressed={getColour(colour).value === option.value} disabled={saving} style={{ background: option.accent }}
          onClick={() => void run(() => onColour(option.value), 'Colour updated.')}>
          {getColour(colour).value === option.value && <Check size={15} strokeWidth={2.5} />}
        </button>)}
      </div>
      <div className="item-menu-actions">
        <button type="button" disabled={saving} onClick={() => void run(onArchive,
          (kind === 'paper' ? 'Paper' : 'Class') + (archived ? ' restored.' : ' archived.'))}>
          {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archived ? 'Restore ' : 'Archive '}{kind}
        </button>
        <button type="button" className="item-menu-danger" disabled={saving} onClick={() => { close(); onDelete(); }}>
          <Trash2 size={16} />Delete {kind}
        </button>
      </div>
      {saving && <span className="item-menu-saving" role="status">Saving...</span>}
    </div>, document.body)}
  </>;
}
