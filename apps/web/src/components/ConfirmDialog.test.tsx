import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("cancels on Escape from the document listener", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="Delete this language?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="Delete this language?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels when the overlay is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog
        message="Delete this language?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(container.querySelector(".confirm-overlay")!);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="Delete this language?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
