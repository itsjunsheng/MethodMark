import { Archive, ArrowLeft } from 'lucide-react';

export function ArchiveToggle({ archived, kind, onChange }: {
  archived: boolean; kind: 'classes' | 'papers'; onChange: (archived: boolean) => void;
}) {
  return <button type="button" className="btn secondary archive-toggle" aria-pressed={archived}
    aria-label={'Show ' + (archived ? 'active ' : 'archived ') + kind} onClick={() => onChange(!archived)}>
    {archived ? <ArrowLeft size={16} /> : <Archive size={16} />}{archived ? 'Back to ' + kind : 'Archive'}
  </button>;
}
