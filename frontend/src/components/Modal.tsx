import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { ToastHost } from './Toast';

type ModalProps = {
  title: string;
  subtitle?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
};

export function Modal({ title, subtitle, header, children, onClose, wide = false, className = '' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, []);

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} tabIndex={-1} className={['modal', wide ? 'wide' : '', className].join(' ')}
      role="dialog" aria-modal="true" aria-label={title}>
      {header ?? <div className="modal-header">
        <div className="modal-header-copy"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
      </div>}
      {children}
      <ToastHost />
    </div>
  </div>;
}
