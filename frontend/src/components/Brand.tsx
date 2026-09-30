export function Brand({ href = '/' }: { href?: string }) {
  return <a className="public-brand" href={href} aria-label="MethodMark home">
    <span className="public-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 24V10l10 9 10-9v14M13 10l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    <span>MethodMark<span className="brand-period">.</span></span>
  </a>;
}
