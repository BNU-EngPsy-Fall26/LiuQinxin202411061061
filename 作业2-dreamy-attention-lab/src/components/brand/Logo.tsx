import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={cn('brand-mark', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brand-stroke" x1="6" y1="7" x2="43" y2="42">
          <stop stopColor="#8295B8" />
          <stop offset="0.55" stopColor="#7D7EAA" />
          <stop offset="1" stopColor="#8CAF9A" />
        </linearGradient>
        <radialGradient id="brand-pearl" cx="0" cy="0" r="1" gradientTransform="translate(24 22) rotate(49) scale(13)">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#DBE6F4" />
          <stop offset="1" stopColor="#BECDE3" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="19.5" stroke="url(#brand-stroke)" strokeWidth="0.9" opacity="0.55" />
      <ellipse
        cx="24"
        cy="23"
        rx="17"
        ry="9.5"
        transform="rotate(-23 24 23)"
        stroke="url(#brand-stroke)"
        strokeWidth="1.1"
      />
      <ellipse
        cx="24"
        cy="23"
        rx="12"
        ry="5.2"
        transform="rotate(41 24 23)"
        stroke="url(#brand-stroke)"
        strokeWidth="0.75"
        opacity="0.55"
      />
      <circle cx="27" cy="20.5" r="4.2" fill="url(#brand-pearl)" stroke="#8C9CB8" strokeWidth="0.7" />
      <circle cx="40" cy="16" r="1.7" fill="#A99BC9" />
      <circle cx="9.5" cy="32" r="1.2" fill="#9DBEAC" />
    </svg>
  );
}

export function Logo({
  to = '/',
  compact = false,
  className,
}: {
  to?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link to={to} className={cn('brand', className)} aria-label="Dreamy Attention Lab 首页">
      <BrandMark />
      {!compact && (
        <span className="brand-copy">
          <span className="brand-name">Dreamy Attention Lab</span>
          <span className="brand-sub">梦境注意实验室</span>
        </span>
      )}
    </Link>
  );
}
