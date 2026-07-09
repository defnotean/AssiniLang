import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoLanguageNotice } from "./views/NoLanguageNotice";

describe("NoLanguageNotice", () => {
  it("shows next-step guidance to create a language from the sidebar", () => {
    render(<NoLanguageNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveClass("empty-state");
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(notice).toHaveTextContent("Select or create a language first.");
    expect(notice).toHaveTextContent(
      "Use New language in the sidebar to open a workspace, then return to this section."
    );
  });
});
