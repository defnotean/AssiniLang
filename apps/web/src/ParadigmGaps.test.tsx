import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LanguageProfile } from "./api";
import type { AsyncState } from "./lib/types";
import { LanguageProfileView } from "./views/LanguageProfileView";

function buildProfileFixture(paradigmGaps: LanguageProfile["paradigmGaps"]): LanguageProfile {
  return {
    language: {
      id: "testlang",
      name: "Testlang",
      typology: "agglutinative",
      description: "A test language.",
      orthography: "latin",
      status: "active"
    },
    phonology: null,
    vocabulary: [],
    morphemeInventory: [],
    grammarRules: [],
    paradigmGaps,
    stats: {
      vocabularyItems: 0,
      grammarRules: 0,
      corpusPassages: 0,
      notes: 0,
      exercises: 0,
      sourceAssets: 0,
      pendingExtractionDrafts: 0,
      exerciseTypes: {}
    }
  };
}

function readyState(profile: LanguageProfile): AsyncState<LanguageProfile> {
  return { status: "ready", data: profile };
}

describe("paradigm gaps panel", () => {
  it("renders gap rows with lemma, dimension, attested and missing cells, and passage count", () => {
    const profile = buildProfileFixture([
      {
        lemma: "talo",
        dimension: "person",
        attested: ["1sg", "3sg"],
        missing: ["2sg"],
        evidencePassageIds: ["testlang-c001", "testlang-c003"]
      }
    ]);

    render(<LanguageProfileView profileState={readyState(profile)} />);

    const panel = screen.getByRole("region", { name: "Paradigm gaps" });
    expect(within(panel).getByText("1 fieldwork to-do")).toBeInTheDocument();
    expect(within(panel).getByText("talo")).toBeInTheDocument();
    expect(within(panel).getByText("person")).toBeInTheDocument();
    expect(within(panel).getByText("1sg")).toBeInTheDocument();
    expect(within(panel).getByText("3sg")).toBeInTheDocument();
    const missingCell = within(panel).getByText("missing: 2sg");
    expect(missingCell).toHaveClass("paradigm-cell-missing");
    expect(within(panel).getByText("2 linked passages")).toBeInTheDocument();
  });

  it("renders the empty state with a next-step hint when no gaps are reported", () => {
    render(<LanguageProfileView profileState={readyState(buildProfileFixture([]))} />);

    const panel = screen.getByRole("region", { name: "Paradigm gaps" });
    expect(within(panel).getByText("0 fieldwork to-dos")).toBeInTheDocument();
    const emptyState = within(panel).getByRole("status");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent(/No paradigm gaps detected yet/);
    expect(emptyState).toHaveTextContent(/Add segmented corpus passages in Build or Corpus/);
  });

  it("renders lexicon and inventory empty states when the profile has no entries", () => {
    render(<LanguageProfileView profileState={readyState(buildProfileFixture([]))} />);

    const phonologyPanel = screen.getByRole("region", { name: "Phonology profile" });
    expect(within(phonologyPanel).getByText("No phonology declared yet")).toBeInTheDocument();
    expect(
      within(phonologyPanel).getByText(
        "No phonology recorded yet. Add consonants and vowels below to start the inventory, or import a snapshot that already includes phonology."
      )
    ).toHaveAttribute("aria-live", "polite");
    expect(
      within(phonologyPanel).getByText(
        "Add or remove orthography symbols used for corpus checks. Save to update this language."
      )
    ).toBeInTheDocument();

    const vocabularyPanel = screen.getByRole("region", { name: "Vocabulary inventory" });
    expect(within(vocabularyPanel).getByText("0 entries")).toBeInTheDocument();
    expect(
      within(vocabularyPanel).getByText(
        "No lexicon entries yet. Process sources in Build, accept lexeme drafts, or import a word list."
      )
    ).toHaveAttribute("role", "status");

    const grammarPanel = screen.getByRole("region", { name: "Grammar inventory" });
    expect(
      within(grammarPanel).getByText(
        "No grammar notes recorded yet. Process a source in Build, accept grammar-note drafts, then approve them in the Build notes queue."
      )
    ).toBeInTheDocument();

    const morphemePanel = screen.getByRole("region", { name: "Morpheme inventory" });
    expect(
      within(morphemePanel).getByText(
        "No morphemes inferred yet. Add corpus passages with segmentation to populate this inventory."
      )
    ).toBeInTheDocument();
  });
});
