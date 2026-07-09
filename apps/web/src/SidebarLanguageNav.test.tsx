import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarLanguageNav } from "./components/SidebarLanguageNav";

describe("SidebarLanguageNav empty state", () => {
  it("shows next-step guidance when no languages exist yet", () => {
    const onViewSelect = vi.fn();
    render(
      <SidebarLanguageNav
        languages={[]}
        selectedLanguageId={null}
        view="profile"
        sectionCounts={{}}
        onLanguageSelect={() => undefined}
        onViewSelect={onViewSelect}
      />
    );

    const emptyState = screen.getByRole("status");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent("No languages yet.");
    expect(emptyState).toHaveTextContent(
      "Use New language below to start a workspace, then open Start to browse examples."
    );
    expect(screen.getByRole("group", { name: "Workspace overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Practice" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
    expect(document.querySelector(".workspace-section-nav .section-count")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(onViewSelect).toHaveBeenCalledWith("ingest");
  });
});
