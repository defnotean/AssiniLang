import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function CrashingChild(): never {
  throw new Error("Sensitive render details");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <AppErrorBoundary>
        <p>Application content</p>
      </AppErrorBoundary>
    );

    expect(screen.getByText("Application content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a generic fallback and logs the captured error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <CrashingChild />
      </AppErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong.");
    expect(alert).toHaveTextContent("Reload the application to try again.");
    expect(alert).not.toHaveTextContent("Sensitive render details");
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected application render error",
      expect.objectContaining({ message: "Sensitive render details" })
    );
  });

  it("offers an accessible reload action", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onReload = vi.fn();

    render(
      <AppErrorBoundary onReload={onReload}>
        <CrashingChild />
      </AppErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    const reloadButton = within(alert).getByRole("button", {
      name: "Reload application"
    });

    fireEvent.click(reloadButton);

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
