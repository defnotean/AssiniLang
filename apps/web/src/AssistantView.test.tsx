import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSession } from "@assini/db";
import { useAssistantWorkspace } from "./hooks/useAssistantWorkspace";
import { AssistantView } from "./views/AssistantView";

const apiMock = vi.hoisted(() => ({
  createAiSession: vi.fn(),
  continueAiSession: vi.fn()
}));

vi.mock("./api", () => apiMock);

function buildSession(options: { fallback?: boolean; reply?: string } = {}): AiSession {
  const { fallback = false, reply = "Avenik verbs stack transparent suffix chains." } = options;
  return {
    id: "ai-session-avenik-1",
    languageId: "avenik",
    mode: "learner_practice",
    status: "active",
    createdBy: "learner-1",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    contextNoteIds: ["note-1"],
    contextPassageIds: ["passage-1"],
    messages: [
      {
        id: "ai-session-avenik-1-message-1",
        role: "user",
        content: "How do verb chains work?",
        createdAt: "2026-06-11T00:00:00.000Z",
        createdBy: "learner-1"
      },
      {
        id: "ai-session-avenik-1-message-2",
        role: "assistant",
        content: reply,
        createdAt: "2026-06-11T00:00:00.000Z",
        createdBy: "local-ai"
      }
    ],
    thinkingSummary: "Safe reasoning summary.",
    trace: [
      {
        id: "ai-session-avenik-1-trace-output",
        kind: "output",
        label: "Output",
        summary: "Generated a safe response.",
        referencedIds: [],
        warnings: fallback
          ? ["Hidden chain-of-thought is not exposed.", "Deterministic fallback response: no LLM provider is configured."]
          : ["Hidden chain-of-thought is not exposed."]
      }
    ],
    neuralMap: { nodes: [], edges: [] },
    privacy: { redactions: [], exposesHiddenChainOfThought: false }
  } as unknown as AiSession;
}

function Harness({ selectedLanguageId = "avenik" }: { selectedLanguageId?: string | null }) {
  const assistant = useAssistantWorkspace();
  return (
    <AssistantView
      selectedLanguageId={selectedLanguageId}
      contextNoteIds={["note-1"]}
      contextPassageIds={["passage-1"]}
      assistant={assistant}
    />
  );
}

async function startConversation(seed = "How do verb chains work?") {
  fireEvent.change(screen.getByLabelText("Seed prompt"), { target: { value: seed } });
  fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));
  await screen.findByLabelText("Conversation messages");
}

describe("AssistantView", () => {
  beforeEach(() => {
    apiMock.createAiSession.mockResolvedValue(buildSession());
    apiMock.continueAiSession.mockResolvedValue(buildSession());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the no-language notice when no language is selected", () => {
    render(<Harness selectedLanguageId={null} />);
    expect(screen.getByText("Select or create a language first.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Seed prompt")).not.toBeInTheDocument();
  });

  it("renders the empty state explainer and disables start without a seed prompt", () => {
    render(<Harness />);
    expect(screen.getByText(/configured local model using only public workspace context/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start conversation" })).toBeDisabled();
  });

  it("starts a conversation through the api and renders the model reply", async () => {
    render(<Harness />);
    await startConversation();

    expect(apiMock.createAiSession).toHaveBeenCalledWith({
      languageId: "avenik",
      mode: "learner_practice",
      seedPrompt: "How do verb chains work?",
      contextNoteIds: ["note-1"],
      contextPassageIds: ["passage-1"]
    });
    expect(screen.getByText("How do verb chains work?")).toBeInTheDocument();
    expect(screen.getByText("Avenik verbs stack transparent suffix chains.")).toBeInTheDocument();
    expect(screen.getByText("model reply")).toBeInTheDocument();
    expect(screen.queryByText("deterministic fallback (no model)")).not.toBeInTheDocument();
  });

  it("labels the reply with a fallback chip when the trace flags the deterministic fallback", async () => {
    apiMock.createAiSession.mockResolvedValue(buildSession({ fallback: true }));
    render(<Harness />);
    await startConversation();

    expect(screen.getByText("deterministic fallback (no model)")).toBeInTheDocument();
    expect(screen.queryByText("model reply")).not.toBeInTheDocument();
  });

  it("disables sending and shows a thinking indicator while a reply is pending", async () => {
    render(<Harness />);
    await startConversation();

    let resolveReply: (session: AiSession) => void = () => undefined;
    apiMock.continueAiSession.mockImplementation(
      () => new Promise<AiSession>((resolve) => {
        resolveReply = resolve;
      })
    );

    fireEvent.change(screen.getByLabelText("Message the assistant"), { target: { value: "And case particles?" } });
    fireEvent.keyDown(screen.getByLabelText("Message the assistant"), { key: "Enter" });

    expect(await screen.findByText("Thinking...", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thinking..." })).toBeDisabled();
    expect(screen.getByLabelText("Message the assistant")).toBeDisabled();
    expect(apiMock.continueAiSession).toHaveBeenCalledWith("ai-session-avenik-1", "And case particles?", "learner_practice");

    resolveReply(buildSession({ reply: "Case particles attach last." }));
    expect(await screen.findByText("Case particles attach last.")).toBeInTheDocument();
    // The composer is cleared after sending, so the Send button reappears and
    // the textarea is usable again (Send stays disabled only for empty input).
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message the assistant")).toBeEnabled();
  });

  it("renders an error when the session cannot be created", async () => {
    apiMock.createAiSession.mockRejectedValue(new Error("AI session creation failed 502"));
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Seed prompt"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI session creation failed 502");
    expect(screen.getByRole("button", { name: "Start conversation" })).toBeInTheDocument();
  });

  it("renders a send error while keeping the conversation visible", async () => {
    render(<Harness />);
    await startConversation();

    apiMock.continueAiSession.mockRejectedValue(new Error("AI session message failed 502"));
    fireEvent.change(screen.getByLabelText("Message the assistant"), { target: { value: "Again?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI session message failed 502");
    expect(screen.getByText("Avenik verbs stack transparent suffix chains.")).toBeInTheDocument();
  });

  it("resets back to the empty state with New conversation", async () => {
    render(<Harness />);
    await startConversation();

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Seed prompt")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Conversation messages")).not.toBeInTheDocument();
  });
});
