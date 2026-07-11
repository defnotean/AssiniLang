import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../i18n";
import type { CorpusPassage } from "../lib/types";
import { CorpusPassageList } from "./CorpusPassageList";

const passage: CorpusPassage = {
  id: "passage-1",
  languageId: "avenik",
  source: "field-notes",
  sourceMetadata: {
    author: "Test Author",
    year: 2026,
    license: "testing-only",
    consentRecord: "test-consent"
  },
  textTarget: "mira talo",
  textTranslation: "river walk",
  morphologicalSegmentation: [{ surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] }],
  topicTags: ["motion"],
  consentStatus: { use: "testing-only", restrictions: [] }
};

describe("CorpusPassageList", () => {
  it("renders long-list containment on cards without changing corpus content", () => {
    const { container } = render(
      <CorpusPassageList
        corpusCount={1}
        displayMode="cards"
        morphFilter={null}
        onToggleMorphFilter={vi.fn()}
        passages={[passage]}
        t={createTranslator()}
      />
    );

    expect(screen.getByText("mira talo")).toBeInTheDocument();
    expect(screen.getByText("river walk")).toBeInTheDocument();
    expect(container.querySelector("article")).toHaveClass("corpus-card", "corpus-render-row");
  });

  it("keeps interlinear morphemes keyboard-operable and reports their active state", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CorpusPassageList
        corpusCount={1}
        displayMode="interlinear"
        morphFilter="mira"
        onToggleMorphFilter={onToggle}
        passages={[passage]}
        t={createTranslator()}
      />
    );

    const morpheme = screen.getByRole("button", { name: /mira river/i });
    expect(morpheme).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(morpheme);
    expect(onToggle).toHaveBeenCalledWith("mira");
    expect(container.querySelector("article")).toHaveClass("igt-passage", "corpus-render-row");
  });

  it("distinguishes an empty corpus from a search with no matches", () => {
    const { rerender } = render(
      <CorpusPassageList
        corpusCount={0}
        displayMode="cards"
        morphFilter={null}
        onToggleMorphFilter={vi.fn()}
        passages={[]}
        t={createTranslator()}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("No saved examples yet");

    rerender(
      <CorpusPassageList
        corpusCount={2}
        displayMode="cards"
        morphFilter={null}
        onToggleMorphFilter={vi.fn()}
        passages={[]}
        t={createTranslator()}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("No passages match your search");
  });
});
