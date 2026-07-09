import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarLanguageNav } from "./components/SidebarLanguageNav";

describe("SidebarLanguageNav empty state", () => {
  it("shows next-step guidance when no languages exist yet", () => {
    render(
      <SidebarLanguageNav
        languages={[]}
        selectedLanguageId={null}
        view="profile"
        isWorkflowBusy={false}
        sectionCounts={{}}
        onLanguageSelect={() => undefined}
        onViewSelect={() => undefined}
      />
    );

    const emptyState = screen.getByRole("status");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent("No languages yet.");
    expect(emptyState).toHaveTextContent(
      "Use New language below to start a workspace, then open Start to browse examples."
    );
  });
});
