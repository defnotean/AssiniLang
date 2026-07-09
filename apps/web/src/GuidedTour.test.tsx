import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTour, type TourStep } from "./components/GuidedTour";

const STEPS: TourStep[] = [
  { titleKey: "tour.welcomeTitle", bodyKey: "tour.welcomeBody" },
  { titleKey: "tour.sidebarTitle", bodyKey: "tour.sidebarBody" }
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    { width: 1, height: 1 } as DOMRect
  ] as unknown as DOMRectList);
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GuidedTour", () => {
  it("renders an accessible dialog and focuses the first action", () => {
    render(<GuidedTour steps={STEPS} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Guided tour" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Skip tour" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("traps Tab focus inside the tour actions", () => {
    render(<GuidedTour steps={STEPS} onClose={vi.fn()} />);

    const skip = screen.getByRole("button", { name: "Skip tour" });
    const next = screen.getByRole("button", { name: "Next" });

    next.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(skip).toHaveFocus();

    skip.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();
  });

  it("exposes Back on later steps and keeps focus inside the trap", () => {
    render(<GuidedTour steps={STEPS} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const skip = screen.getByRole("button", { name: "Skip tour" });
    const done = screen.getByRole("button", { name: "Done" });

    done.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(skip).toHaveFocus();

    skip.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(done).toHaveFocus();
  });

  it("restores focus to the previously focused element on unmount", () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(<GuidedTour steps={STEPS} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Skip tour" })).toHaveFocus();

    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
