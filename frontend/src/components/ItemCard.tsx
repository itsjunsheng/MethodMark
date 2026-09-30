import type { ReactNode } from 'react';
import { Palette } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { colourStyle, getColour } from '../lib/colours';
import type { ItemColour } from '../lib/colours';
import './ItemCards.css';

type ItemCardProps = {
  title: string;
  colour?: ItemColour;
  icon: LucideIcon;
  className: string;
  openLabel: string;
  onOpen: () => void;
  onColour: () => void;
  children: ReactNode;
};

export function ItemCard({ title, colour, icon: Icon, className, openLabel, onOpen, onColour, children }: ItemCardProps) {
  return <article className={'panel colour-card ' + className} style={colourStyle(colour)}>
    <div className="item-card-tools">
      <span className="item-card-icon" aria-hidden="true"><Icon size={20} /></span>
      <button type="button" className="item-colour-button" onClick={onColour}
        aria-label={'Change colour for ' + title} title={'Colour: ' + getColour(colour).label}>
        <Palette size={15} /><span>Colour</span>
      </button>
    </div>
    <button type="button" className="item-card-open" onClick={onOpen} aria-label={openLabel}>
      {children}
    </button>
  </article>;
}
