'use client';

export default function BrandLogo() {
  return (
    <div className="brand-logo" aria-label="Collect It logo">
      <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#facc15" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="46" fill="#fff6db" stroke="url(#ring)" strokeWidth="8" />
        <path d="M24 60h72" stroke="#1e293b" strokeWidth="7" strokeLinecap="round" />
        <circle cx="60" cy="60" r="16" fill="#fff" stroke="#1e293b" strokeWidth="7" />
        <circle cx="60" cy="60" r="6" fill="#f97316" />
      </svg>
      <div>
        <p>Collect It</p>
        <span>Pokemon TCG Vault</span>
      </div>
    </div>
  );
}