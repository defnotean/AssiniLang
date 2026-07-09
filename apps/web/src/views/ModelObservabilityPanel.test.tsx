import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelObservabilityPanel } from "./ModelObservabilityPanel";

describe("ModelObservabilityPanel", () => {
  it("localizes session status, mode, and message counts", () => {
    render(
      <ModelObservabilityPanel
        observabilityState={{
          status: "ready",
          data: {
            totals: {
              sessions: 1,
              activeSessions: 1,
              messages: 2,
              elderCorrections: 0
            },
            sessions: [
              {
                id: "session-1",
                languageId: "avenik",
                mode: "learner_practice",
                status: "active",
                createdBy: "learner",
                messageCount: 2,
                contextNoteIds: [],
                contextPassageIds: [],
                thinkingSummary: "",
                privacy: {
                  exposesHiddenChainOfThought: false,
                  redactions: []
                },
                createdAt: "2026-07-09T00:00:00.000Z",
                updatedAt: "2026-07-09T00:00:00.000Z"
              }
            ]
          }
        }}
      />
    );

    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("learner practice")).toBeInTheDocument();
    expect(screen.getByText("2 messages")).toBeInTheDocument();
    expect(screen.queryByText("learner_practice")).not.toBeInTheDocument();
  });

  it("announces an empty session list with a polite status", () => {
    render(
      <ModelObservabilityPanel
        observabilityState={{
          status: "ready",
          data: {
            totals: {
              sessions: 0,
              activeSessions: 0,
              messages: 0,
              elderCorrections: 0
            },
            sessions: []
          }
        }}
      />
    );

    const empty = screen.getByRole("status");
    expect(empty).toHaveAttribute("aria-live", "polite");
    expect(empty).toHaveTextContent("No AI sessions recorded.");
  });
});
