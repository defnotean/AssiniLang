import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";

function buildCommands(overrides: Partial<Record<string, () => void>> = {}): PaletteCommand[] {
  return [
    { id: "language-avenik", label: "Go to Avenik", run: overrides["language-avenik"] ?? vi.fn() },
    { id: "language-solari", label: "Go to Solari", run: overrides["language-solari"] ?? vi.fn() },
    { id: "view-corpus", label: "Open Corpus Browser", run: overrides["view-corpus"] ?? vi.fn() },
    { id: "view-review", label: "Open Note Review Queue", run: overrides["view-review"] ?? vi.fn() },
    { id: "toggle-theme", label: "Toggle theme", run: overrides["toggle-theme"] ?? vi.fn() }
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommandPalette", () => {
  it("renders a labeled dialog with every command and focuses the input", () => {
    render(<CommandPalette commands={buildCommands()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Search commands")).toHaveFocus();
    expect(screen.getByRole("option", { name: "Go to Avenik" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Go to Solari" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Open Corpus Browser" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("filters commands as the user types", () => {
    render(<CommandPalette commands={buildCommands()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "corpus" } });

    expect(screen.getByRole("option", { name: "Open Corpus Browser" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Go to Avenik" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Toggle theme" })).not.toBeInTheDocument();
  });

  it("shows an empty notice when nothing matches", () => {
    render(<CommandPalette commands={buildCommands()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "zzzzzz" } });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    const empty = screen.getByRole("status");
    expect(empty).toHaveAttribute("aria-live", "polite");
    expect(empty).toHaveTextContent("No matching commands");
    expect(empty).toHaveTextContent("Try another keyword, or clear the search to see every command.");
  });

  it("runs the highlighted command with arrow keys plus Enter and closes", () => {
    const runSolari = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette commands={buildCommands({ "language-solari": runSolari })} onClose={onClose} />);

    const input = screen.getByLabelText("Search commands");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Go to Solari" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(runSolari).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the selection back up with ArrowUp", () => {
    render(<CommandPalette commands={buildCommands()} onClose={vi.fn()} />);

    const input = screen.getByLabelText("Search commands");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(screen.getByRole("option", { name: "Go to Avenik" })).toHaveAttribute("aria-selected", "true");
  });

  it("runs a command when it is clicked", () => {
    const runTheme = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette commands={buildCommands({ "toggle-theme": runTheme })} onClose={onClose} />);

    fireEvent.click(screen.getByRole("option", { name: "Toggle theme" }));

    expect(runTheme).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape without running anything", () => {
    const runAvenik = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette commands={buildCommands({ "language-avenik": runAvenik })} onClose={onClose} />);

    fireEvent.keyDown(screen.getByLabelText("Search commands"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(runAvenik).not.toHaveBeenCalled();
  });

  it("restores focus to the previously focused element on unmount", () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(<CommandPalette commands={buildCommands()} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Search commands")).toHaveFocus();

    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
