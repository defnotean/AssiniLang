import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Language } from "../lib/types";
import { WorkspaceHeader } from "./WorkspaceHeader";

const language = {
  id: "lang-avenik",
  name: "Avenik",
  description: "Test language",
  orthography: "Latin",
  typology: "agglutinative",
  status: "active"
} as Language;

function renderHeader(overrides: Partial<Parameters<typeof WorkspaceHeader>[0]> = {}) {
  return render(
    <WorkspaceHeader
      view="ingest"
      currentTitle="Build"
      currentEyebrow="Sources"
      currentBreadcrumb="Workspace / Build"
      selectedLanguage={language}
      isWorkflowBusy={false}
      isDrafting={false}
      isModelDrafting={false}
      isEvaluating={false}
      modelDraftMessage={null}
      modelDraftError={null}
      actionError={null}
      onGenerateDrafts={vi.fn()}
      onGenerateModelDrafts={vi.fn()}
      onRunEval={vi.fn()}
      {...overrides}
    />
  );
}

describe("WorkspaceHeader", () => {
  it("localizes language status through formatStatus", () => {
    renderHeader({
      selectedLanguage: { ...language, status: "archived" }
    });
    expect(screen.getByText("archived workspace")).toBeInTheDocument();
  });

  it("hides selected-language metadata and actions without a language", () => {
    renderHeader({ selectedLanguage: null });

    expect(screen.queryByLabelText("Selected language metadata")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate AI Drafts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft notes with model" })).not.toBeInTheDocument();
  });

  it("exposes aria-busy on drafting and evaluation actions while in flight", () => {
    const { rerender } = renderHeader({ isWorkflowBusy: true, isDrafting: true });
    expect(screen.getByRole("button", { name: "Drafting..." })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Draft notes with model" })).not.toHaveAttribute("aria-busy", "true");

    rerender(
      <WorkspaceHeader
        view="model"
        currentTitle="Checks"
        currentEyebrow="Evaluation"
        currentBreadcrumb="Workspace / Checks"
        selectedLanguage={language}
        isWorkflowBusy={true}
        isDrafting={false}
        isModelDrafting={false}
        isEvaluating={true}
        modelDraftMessage={null}
        modelDraftError={null}
        actionError={null}
        onGenerateDrafts={vi.fn()}
        onGenerateModelDrafts={vi.fn()}
        onRunEval={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Evaluating..." })).toHaveAttribute("aria-busy", "true");
  });
});
