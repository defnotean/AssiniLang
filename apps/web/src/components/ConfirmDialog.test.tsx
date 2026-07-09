import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function ConfirmDialogHarness({
  onCancel,
  onConfirm = vi.fn()
}: {
  onCancel: () => void;
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Restore backup
      </button>
      {open && (
        <ConfirmDialog
          message="Restore the latest backup?"
          onConfirm={() => {
            onConfirm();
            setOpen(false);
          }}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function openFromTrigger() {
  const trigger = screen.getByTestId("trigger");
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(document.activeElement).not.toBe(trigger);
  return trigger;
}

describe("ConfirmDialog", () => {
  it("exposes the confirmation message to assistive tech via aria-describedby", () => {
    render(
      <ConfirmDialog
        message="Delete this language?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Confirmation" });
    expect(dialog).toHaveAttribute("aria-describedby", "confirm-dialog-message");
    expect(dialog).toHaveAccessibleDescription("Delete this language?");
  });

  it("cancels on Escape from the document listener and restores focus to the trigger", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialogHarness onCancel={onCancel} />);

    const trigger = openFromTrigger();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("cancels when the cancel button is clicked and restores focus to the trigger", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialogHarness onCancel={onCancel} />);

    const trigger = openFromTrigger();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
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
