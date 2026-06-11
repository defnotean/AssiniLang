import type { CorpusPassage } from "../lib/types";

export function MorphChips({
  morphemes,
  onSelect,
  activeSurface
}: {
  morphemes: CorpusPassage["morphologicalSegmentation"];
  onSelect?: (surface: string) => void;
  activeSurface?: string | null;
}) {
  return (
    <div className="morph-chips">
      {morphemes.map((morpheme, index) => {
        const key = `${morpheme.surface}-${morpheme.gloss}-${index}`;
        if (!onSelect) {
          return (
            <span className="morph-chip" key={key}>
              <strong>{morpheme.surface}</strong>
              <span>{morpheme.gloss}</span>
            </span>
          );
        }
        const isActive = activeSurface === morpheme.surface;
        return (
          <button
            type="button"
            className={`morph-chip morph-chip-button${isActive ? " active" : ""}`}
            key={key}
            aria-pressed={isActive}
            onClick={() => onSelect(morpheme.surface)}
          >
            <strong>{morpheme.surface}</strong>
            <span>{morpheme.gloss}</span>
          </button>
        );
      })}
    </div>
  );
}
