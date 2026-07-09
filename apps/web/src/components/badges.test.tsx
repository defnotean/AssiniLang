import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfidenceBadge, StatusBadge } from "./badges";

describe("StatusBadge and ConfidenceBadge", () => {
  it("renders localized status labels instead of raw snake_case tokens", () => {
    render(<StatusBadge status="under_review" />);
    expect(screen.getByText("under review")).toBeInTheDocument();
    expect(screen.queryByText("under_review")).not.toBeInTheDocument();
  });

  it("renders localized confidence labels", () => {
    render(<ConfidenceBadge confidence="high" />);
    expect(screen.getByText("high confidence")).toBeInTheDocument();
  });
});
