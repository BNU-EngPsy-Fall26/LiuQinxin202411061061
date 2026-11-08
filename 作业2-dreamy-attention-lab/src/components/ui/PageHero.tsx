import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function PageHero({
  eyebrow,
  title,
  english,
  aside,
  breadcrumb,
  children,
}: {
  eyebrow: string;
  title: string;
  english: string;
  aside?: ReactNode;
  breadcrumb?: Array<{ label: string; to?: string }>;
  children?: ReactNode;
}) {
  return (
    <div className="page-hero">
      {breadcrumb && (
        <nav className="breadcrumb" aria-label="面包屑">
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}-${index}`} style={{ display: 'contents' }}>
              {index > 0 && <span aria-hidden="true">/</span>}
              {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="page-hero__row" style={{ marginTop: breadcrumb ? 28 : 0 }}>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>
            {title}
            <span className="en">{english}</span>
          </h1>
        </div>
        {aside && <div className="page-hero__aside">{aside}</div>}
      </div>
      {children}
    </div>
  );
}
