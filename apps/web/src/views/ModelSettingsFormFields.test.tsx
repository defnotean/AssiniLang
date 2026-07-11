import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, type SettingsFormState } from "../lib/modelSettings";
import { ModelSettingsFormFields } from "./ModelSettingsFormFields";

function Harness() {
  const [form, setForm] = useState<SettingsFormState>(DEFAULT_FORM);
  return (
    <form>
      <ModelSettingsFormFields form={form} setForm={setForm} isSavingSettings={false}>
        <div>Discovery controls</div>
      </ModelSettingsFormFields>
      <output aria-label="form state">{JSON.stringify(form)}</output>
    </form>
  );
}

describe("ModelSettingsFormFields", () => {
  it("keeps specialist controls collapsed until requested", () => {
    render(<Harness />);

    const transcription = screen.getByText("Audio transcription").closest("details");
    const embeddings = screen.getByText("Embedding retrieval").closest("details");
    const ocr = screen.getAllByText("OCR model")[0]?.closest("details");
    const ingestion = screen.getByText("Ingestion safety").closest("details");
    expect(embeddings).not.toHaveAttribute("open");
    expect(transcription).not.toHaveAttribute("open");
    expect(ocr).not.toHaveAttribute("open");
    expect(ingestion).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Audio transcription"));
    expect(transcription).toHaveAttribute("open");
  });

  it("plumbs dedicated embedding endpoint, model, key, clear, and timeout controls", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Embedding retrieval"));

    fireEvent.change(screen.getByLabelText("Embedding base URL"), {
      target: { value: "http://127.0.0.1:8080/v1" }
    });
    fireEvent.change(screen.getByLabelText("Embedding model"), {
      target: { value: "nomic-embed-text" }
    });
    fireEvent.change(screen.getByLabelText("Replace embedding key"), {
      target: { value: "embedding-secret" }
    });
    fireEvent.change(screen.getByLabelText("Embedding timeout"), {
      target: { value: "15000" }
    });

    expect(screen.getByLabelText("form state")).toHaveTextContent('"embeddingBaseUrl":"http://127.0.0.1:8080/v1"');
    expect(screen.getByLabelText("form state")).toHaveTextContent('"embeddingModel":"nomic-embed-text"');
    expect(screen.getByLabelText("form state")).toHaveTextContent('"embeddingTimeoutMs":"15000"');

    fireEvent.click(screen.getByLabelText("Clear embedding key"));
    expect(screen.getByLabelText("Replace embedding key")).toBeDisabled();
    expect(screen.getByLabelText("Replace embedding key")).toHaveValue("");
    expect(screen.getByLabelText("form state")).toHaveTextContent('"clearEmbeddingApiKey":true');
  });
});
