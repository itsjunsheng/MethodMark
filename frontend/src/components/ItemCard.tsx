import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { colourStyle } from '../lib/colours';
import type { ItemColour } from '../lib/colours';
import { ItemMenu } from './ItemMenu';
import type { ItemActions } from './ItemMenu';
import './ItemCards.css';

type ItemCardProps = ItemActions & {
  title: string;
  subtitle: string;
  colour?: ItemColour;
  archived?: boolean;
  kind: 'paper' | 'class';
  icon: LucideIcon;
  className: string;
  openLabel: string;
  onOpen: () => void;
  children: ReactNode;
};

export function ItemCard({ title, subtitle, colour, archived, kind, icon: Icon, className, openLabel, onOpen, children, ...actions }: ItemCardProps) {
  return <article className={'panel colour-card ' + className} style={colourStyle(colour)}>
    <div className="item-card-tools">
      <span className="item-card-icon" aria-hidden="true"><Icon size={20} /></span>
      <ItemMenu title={title} colour={colour} archived={archived} kind={kind} {...actions} />
    </div>
    <button type="button" className="item-card-open" onClick={onOpen} aria-label={openLabel}>
      <h3 className="item-card-title">{title}</h3>
      <p className="item-card-subtitle">{subtitle}</p>
      <span className="item-card-footer">{children}</span>
    </button>
  </article>;
}
