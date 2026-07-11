import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Language } from "@assini/api-contract";
import { PhonologyInventoryEditor } from "./PhonologyInventoryEditor";

const apiMock = vi.hoisted(() => ({
  updateLanguage: vi.fn()
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    updateLanguage: apiMock.updateLanguage
  };
});

function buildLanguage(overrides: Partial<Language> = {}): Language {
  return {
    id: "avenik",
    name: "Avenik",
    typology: "agglutinative",
    description: "Agglutinative test language.",
    orthography: "Latin",
    status: "active",
    ...overrides
  };
}

describe("PhonologyInventoryEditor", () => {
  beforeEach(() => {
    apiMock.updateLanguage.mockReset();
  });

  it("shows the empty-state path and can add, remove, validate, and save inventory symbols", async () => {
    const onSaved = vi.fn();
    const savedLanguage = buildLanguage({
      phonology: {
        consonants: ["m"],
        vowels: ["a"],
        notes: []
      }
    });
    apiMock.updateLanguage.mockResolvedValue(savedLanguage);

    render(<PhonologyInventoryEditor language={buildLanguage()} isWorkflowBusy={false} onSaved={onSaved} />);

    const panel = screen.getByRole("region", { name: "Phonology profile" });
    expect(within(panel).getByText("No phonology declared yet")).toBeInTheDocument();
    expect(within(panel).getByText(/Add consonants and vowels below/)).toBeInTheDocument();
    expect(within(panel).getByText(/import a snapshot/)).toBeInTheDocument();

    const form = within(panel).getByRole("form", { name: "Phonology inventory editor" });
    const saveButton = within(form).getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(within(form).getByLabelText("New consonant symbol"), { target: { value: "m" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add consonant" }));
    fireEvent.change(within(form).getByLabelText("New vowel symbol"), { target: { value: "a" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add vowel" }));

    expect(within(form).getByText("m")).toBeInTheDocument();
    expect(within(form).getByText("a")).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    fireEvent.change(within(form).getByLabelText("New consonant symbol"), { target: { value: "m" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add consonant" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("already in this inventory list");

    fireEvent.click(within(form).getByRole("button", { name: "Remove m" }));
    expect(within(form).queryByText("m")).not.toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText("New consonant symbol"), { target: { value: "m" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add consonant" }));
    fireEvent.click(saveButton);

    await waitFor(() => expect(apiMock.updateLanguage).toHaveBeenCalledTimes(1));
    expect(apiMock.updateLanguage).toHaveBeenCalledWith("avenik", {
      phonology: {
        consonants: ["m"],
        vowels: ["a"],
        notes: []
      }
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedLanguage));
    expect(await within(form).findByRole("status")).toHaveTextContent("Phonology inventory saved.");
  });

  it("preserves syllable template, stress, and notes when editing an existing inventory", async () => {
    const onSaved = vi.fn();
    const language = buildLanguage({
      phonology: {
        consonants: ["t"],
        vowels: ["a"],
        syllableTemplate: "CV",
        stress: "word-initial",
        notes: ["No clusters."]
      }
    });
    apiMock.updateLanguage.mockResolvedValue({
      ...language,
      phonology: {
        consonants: ["t", "k"],
        vowels: ["a"],
        syllableTemplate: "CV",
        stress: "word-initial",
        notes: ["No clusters."]
      }
    });

    render(<PhonologyInventoryEditor language={language} isWorkflowBusy={false} onSaved={onSaved} />);

    const form = screen.getByRole("form", { name: "Phonology inventory editor" });
    expect(screen.getByRole("heading", { level: 2, name: "Sound inventory" })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("New consonant symbol"), { target: { value: "k" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add consonant" }));
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiMock.updateLanguage).toHaveBeenCalledWith("avenik", {
        phonology: {
          consonants: ["t", "k"],
          vowels: ["a"],
          syllableTemplate: "CV",
          stress: "word-initial",
          notes: ["No clusters."]
        }
      })
    );
  });

  it("rejects blank symbols before calling the API", () => {
    render(<PhonologyInventoryEditor language={buildLanguage()} isWorkflowBusy={false} onSaved={vi.fn()} />);

    const form = screen.getByRole("form", { name: "Phonology inventory editor" });
    fireEvent.click(within(form).getByRole("button", { name: "Add consonant" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("non-empty symbol");
    expect(apiMock.updateLanguage).not.toHaveBeenCalled();
  });
});
