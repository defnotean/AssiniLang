import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { ConfidenceBadge, StatusBadge } from "./badges";

describe("StatusBadge and ConfidenceBadge", () => {
  it("renders localized status labels instead of raw snake_case tokens", () => {
    render(<StatusBadge status="under_review" />);
    const badge = screen.getByRole("status", { name: "under review" });
    expect(badge).toHaveTextContent("under review");
    expect(screen.queryByText("under_review")).not.toBeInTheDocument();
  });

  it("renders localized confidence labels with status semantics", () => {
    render(<ConfidenceBadge confidence="high" />);
    expect(screen.getByRole("status", { name: "high confidence" })).toHaveTextContent("high confidence");

    render(<ConfidenceBadge confidence="medium" />);
    expect(screen.getByRole("status", { name: "medium confidence" })).toBeInTheDocument();

    render(<ConfidenceBadge confidence="low" />);
    expect(screen.getByRole("status", { name: "low confidence" })).toBeInTheDocument();
  });});
