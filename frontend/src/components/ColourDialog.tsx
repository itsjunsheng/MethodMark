import { useState } from 'react';
import type { FormEvent } from 'react';
import { colours, colourStyle, getColour } from '../lib/colours';
import type { ItemColour } from '../lib/colours';
import { Modal } from './Modal';
import { useToast } from './Toast';
import './ItemCards.css';

export function ColourDialog({ name, colour, onSave, onClose }: {
  name: string; colour?: string; onSave: (colour: ItemColour) => Promise<void>; onClose: () => void;
}) {
  const [selected, setSelected] = useState(getColour(colour).value);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); toast.dismiss();
    try {
      await onSave(selected);
      onClose();
      toast.success('Colour updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the colour. Please try again.');
    } finally { setSaving(false); }
  }

  return <Modal title="Choose a colour" subtitle={name} className="colour-dialog"
    onClose={() => { if (!saving) onClose(); }}>
    <form className="modal-body" onSubmit={save}>
      <fieldset className="colour-options" disabled={saving}>
        <legend>Card colour</legend>
        {colours.map(option => <label key={option.value} className="colour-option" style={colourStyle(option.value)}>
          <input type="radio" name="colour" value={option.value} checked={selected === option.value}
            onChange={() => setSelected(option.value)} />
          <span>{option.label}</span>
        </label>)}
      </fieldset>
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving || selected === getColour(colour).value}>
          {saving ? 'Saving...' : 'Save colour'}
        </button>
      </div>
    </form>
  </Modal>;
}
