import type { CorpusPassage } from "../lib/types";

export function MorphChips({ morphemes }: { morphemes: CorpusPassage["morphologicalSegmentation"] }) {
  return (
    <div className="morph-chips">
      {morphemes.map((morpheme, index) => (
        <span className="morph-chip" key={`${morpheme.surface}-${morpheme.gloss}-${index}`}>
          <strong>{morpheme.surface}</strong>
          <span>{morpheme.gloss}</span>
        </span>
      ))}
    </div>
  );
}
