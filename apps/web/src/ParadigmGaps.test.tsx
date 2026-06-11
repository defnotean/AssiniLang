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

  it("renders the empty state when no gaps are reported", () => {
    render(<LanguageProfileView profileState={readyState(buildProfileFixture([]))} />);

    const panel = screen.getByRole("region", { name: "Paradigm gaps" });
    expect(within(panel).getByText("0 fieldwork to-dos")).toBeInTheDocument();
    expect(
      within(panel).getByText("No paradigm gaps detected - or not enough attested cells to infer paradigms yet.")
    ).toBeInTheDocument();
  });
});
