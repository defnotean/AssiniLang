import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/apiClient";
import { DeleteLanguageForm } from "./DeleteLanguageForm";

const LANGUAGES = [
  { id: "lang-1", name: "Avenik", description: "Test", orthography: "Latin", status: "draft" as const, typology: "unknown" as const },
  { id: "lang-2", name: "Testlang", description: "Fixture", orthography: "Latin", status: "draft" as const, typology: "unknown" as const }
];

describe("DeleteLanguageForm", () => {
  afterEach(() => {
    cleanup();
  });
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

  it("localizes rate-limit and payload-too-large deletion failures", async () => {
    const onDelete = vi.fn()
      .mockRejectedValueOnce(
        new ApiError("Request failed: /languages/lang-1 (429): Rate limit exceeded", {
          status: 429,
          i18nKey: "app.rateLimitExceeded",
          i18nParams: { seconds: 8 }
        })
      )
      .mockRejectedValueOnce(
        new ApiError("Request failed: /languages/lang-1 (413): Payload too large", {
          status: 413,
          i18nKey: "errors.payloadTooLarge"
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Wait 8 seconds, then retry."
    );

    fireEvent.change(screen.getByLabelText("Type the language name to confirm"), {
      target: { value: "Avenik" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That request is too large. Shrink the payload or upload a smaller file, then retry."
    );
  });
});
