import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateLanguageForm } from "./CreateLanguageForm";

describe("CreateLanguageForm", () => {
  it("marks create busy with aria-busy while the request is in flight", async () => {
    let resolveCreate: () => void = () => undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        })
    );

    render(<CreateLanguageForm isWorkflowBusy={false} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New language" }));
    fireEvent.change(screen.getByLabelText("Language name"), { target: { value: "Avenik" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Test language" } });
    fireEvent.change(screen.getByLabelText("Orthography"), { target: { value: "Latin" } });
    fireEvent.click(screen.getByRole("button", { name: "Create language" }));

    const busyButton = screen.getByRole("button", { name: "Creating..." });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");
    expect(onCreate).toHaveBeenCalledOnce();

    resolveCreate();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New language" })).toBeInTheDocument();
    });
  });
});
