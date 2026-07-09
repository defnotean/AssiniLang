import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteLanguageForm } from "./DeleteLanguageForm";

const LANGUAGES = [
  { id: "lang-1", name: "Avenik", description: "Test", orthography: "Latin", status: "draft" as const, typology: "unknown" as const },
  { id: "lang-2", name: "Testlang", description: "Fixture", orthography: "Latin", status: "draft" as const, typology: "unknown" as const }
];

describe("DeleteLanguageForm", () => {
  it("locks fields and marks delete busy with aria-busy while the request is in flight", async () => {
    let resolveDelete: () => void = () => undefined;
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );

    render(
      <DeleteLanguageForm
        languages={LANGUAGES}
        selectedLanguageId="lang-1"
        isWorkflowBusy={false}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete language" }));
    fireEvent.change(screen.getByLabelText("Type the language name to confirm"), {
      target: { value: "Avenik" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    const busyButton = screen.getByRole("button", { name: "Deleting..." });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("form", { name: "Delete language" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Language to delete")).toBeDisabled();
    expect(screen.getByLabelText("Type the language name to confirm")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onDelete).toHaveBeenCalledWith("lang-1");

    resolveDelete();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete language" })).toBeInTheDocument();
    });
  });

  it("keeps the form open and shows an alert when deletion fails", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("language still referenced"));

    render(
      <DeleteLanguageForm
        languages={LANGUAGES}
        selectedLanguageId="lang-2"
        isWorkflowBusy={false}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete language" }));
    fireEvent.change(screen.getByLabelText("Type the language name to confirm"), {
      target: { value: "Testlang" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("language still referenced");
    expect(screen.getByRole("form", { name: "Delete language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete permanently" })).not.toHaveAttribute("aria-busy");
  });
});
