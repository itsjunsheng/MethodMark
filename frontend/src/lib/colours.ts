import type { CSSProperties } from 'react';

export const colours = [
  { value: 'sage', label: 'Sage', accent: '#698774', soft: '#edf3ee' },
  { value: 'blue', label: 'Blue', accent: '#688ba5', soft: '#edf3f8' },
  { value: 'lavender', label: 'Lavender', accent: '#9984b0', soft: '#f2eef7' },
  { value: 'rose', label: 'Rose', accent: '#b7818e', soft: '#f9eef1' },
  { value: 'peach', label: 'Peach', accent: '#c69170', soft: '#fbf0e8' },
  { value: 'sand', label: 'Sand', accent: '#b49b62', soft: '#f7f3e7' },
  { value: 'teal', label: 'Teal', accent: '#508d88', soft: '#eaf5f3' },
  { value: 'mint', label: 'Mint', accent: '#76a18a', soft: '#edf7f0' },
  { value: 'sky', label: 'Sky', accent: '#729fb9', soft: '#eef6fb' },
  { value: 'indigo', label: 'Indigo', accent: '#767fad', soft: '#eff0f9' },
  { value: 'plum', label: 'Plum', accent: '#a0799b', soft: '#f6edf5' },
  { value: 'slate', label: 'Slate', accent: '#7b8793', soft: '#f0f3f5' },
] as const;
export type ItemColour = typeof colours[number]['value'];

export const randomColour = (): ItemColour => colours[Math.floor(Math.random() * colours.length)].value;
export const getColour = (value?: string) => colours.find(colour => colour.value === value) ?? colours[0];
export function colourStyle(value?: string): CSSProperties {
  const colour = getColour(value);
  return { '--item-colour': colour.accent, '--item-tint': colour.soft } as CSSProperties;
}
