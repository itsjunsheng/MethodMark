import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './PaperToolbar.css';

type PaperToolbarProps = {
  title: string;
  description: string;
  descriptionId?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
};

export function PaperToolbar({ title, description, descriptionId, children, onClose, className = '' }: PaperToolbarProps) {
  return <header className={'paper-toolbar ' + (onClose ? 'paper-toolbar--dismissible ' : '') + className}>
    <div className="paper-toolbar-copy">
      <h2 title={title}>{title}</h2>
      <p id={descriptionId} title={description}>{description}</p>
    </div>
    <div className="paper-toolbar-actions">{children}</div>
    {onClose && <button type="button" className="paper-toolbar-close" aria-label="Close dialog" title="Close"
      onClick={onClose}><X size={16} /></button>}
  </header>;
}

type PaperToolbarButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
  label: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary';
  iconOnly?: boolean;
};

export function PaperToolbarButton({ label, icon: Icon, iconOnly = false, variant = 'secondary', className = '', ...props }: PaperToolbarButtonProps) {
  return <button type="button" {...props} aria-label={label} title={label}
    className={'btn ' + variant + ' paper-toolbar-action ' + (iconOnly ? 'paper-toolbar-icon ' : '') + className}>
    {Icon && <Icon size={14} aria-hidden="true" />}<span className="paper-toolbar-label">{label}</span>
  </button>;
}
