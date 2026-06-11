import type { Language, ViewMode } from "../lib/types";

export function CompassMark() {
  return (
    <svg className="compass-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="17" className="compass-ring" />
      <circle cx="20" cy="20" r="7" className="compass-ring inner" />
      <path d="M20 2v36M2 20h36M7.8 7.8l24.4 24.4M32.2 7.8 7.8 32.2" className="compass-line" />
      <circle cx="20" cy="2.7" r="2.5" className="compass-dot main" />
      <circle cx="37.3" cy="20" r="2.5" className="compass-dot main" />
      <circle cx="20" cy="37.3" r="2.5" className="compass-dot main" />
      <circle cx="2.7" cy="20" r="2.5" className="compass-dot main" />
      <circle cx="32.2" cy="7.8" r="1.8" className="compass-dot" />
      <circle cx="32.2" cy="32.2" r="1.8" className="compass-dot" />
      <circle cx="7.8" cy="32.2" r="1.8" className="compass-dot" />
      <circle cx="7.8" cy="7.8" r="1.8" className="compass-dot" />
      <circle cx="20" cy="20" r="3.2" className="compass-dot main" />
    </svg>
  );
}

export function TypologyMark({ typology }: { typology: Language["typology"] }) {
  if (typology === "agglutinative") {
    return (
      <svg className="typology-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="22" height="4.8" rx="1.5" />
        <rect x="3" y="12" width="16" height="4.8" rx="1.5" opacity="0.64" />
        <rect x="3" y="19" width="10" height="4.8" rx="1.5" opacity="0.38" />
      </svg>
    );
  }

  if (typology === "isolating") {
    return (
      <svg className="typology-mark" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="5.5" cy="14" r="3.8" />
        <circle cx="14" cy="14" r="3.8" />
        <circle cx="22.5" cy="14" r="3.8" />
      </svg>
    );
  }

  if (typology === "fusional") {
    return (
      <svg className="typology-mark outline" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="10" cy="14" r="7.4" />
        <circle cx="18" cy="14" r="7.4" />
      </svg>
    );
  }

  return (
    <svg className="typology-mark outline" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <polygon points="14,3 25,14 14,25 3,14" />
      <circle cx="14" cy="3" r="2.2" className="filled" />
      <circle cx="25" cy="14" r="2.2" className="filled" />
      <circle cx="14" cy="25" r="2.2" className="filled" />
      <circle cx="3" cy="14" r="2.2" className="filled" />
    </svg>
  );
}

export function ViewGlyph({ view }: { view: ViewMode }) {
  return <span className={`view-glyph ${view}`} aria-hidden="true" />;
}

export function DiamondBand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "diamond-band compact" : "diamond-band"} aria-hidden="true" />;
}
