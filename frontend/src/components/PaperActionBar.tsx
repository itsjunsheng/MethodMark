import type { ReactNode } from 'react';
import './PaperToolbar.css';

export function PaperActionBar({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return <footer className="paper-action-bar">
    <div className="paper-action-bar-copy">{children}</div>
    <div className="paper-action-bar-actions">{actions}</div>
  </footer>;
}
