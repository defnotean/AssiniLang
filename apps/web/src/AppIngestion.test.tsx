import {
  cleanupAppTest,
  createAudioSource,
  createDeferred,
  createGrammarDraft,
  createLexemeDraft,
  createTextSource,
  createTextSourceWithWarnings,
  getApiMock,
  renderReady,
  setupAppTest
} from "./App.testHarness";
import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "./lib/apiClient";

const apiMock = getApiMock();

describe("App ingestion workspace", () => {
  beforeEach(setupAppTest);
  afterEach(cleanupAppTest);
  it("renders registered sources and the extraction draft queue for the selected language", async () => {
    apiMock.fetchSources.mockResolvedValue([createTextSource(), createAudioSource()]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([createLexemeDraft(), createGrammarDraft()]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Build" })).toBeInTheDocument();
    const sourcesRegion = await screen.findByRole("region", { name: "Registered sources" });
    await waitFor(() => expect(apiMock.fetchSources).toHaveBeenCalledWith("avenik"));
    expect(apiMock.fetchExtractionDrafts).toHaveBeenCalledWith("avenik", "proposed");
    expect(within(sourcesRegion).getByText("2 sources")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("Field notebook page")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("Elder recording")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("Text")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("Audio")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("transcript ready")).toBeInTheDocument();

    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(within(draftQueue).getByText("2 proposed drafts")).toBeInTheDocument();
    expect(within(draftQueue).getByText("tala — water")).toBeInTheDocument();
    expect(within(draftQueue).getByText("high confidence")).toBeInTheDocument();
    expect(within(draftQueue).getByText("Equals sign indicates a gloss pair.")).toBeInTheDocument();
    expect(
      within(draftQueue).getByText("noun phrases — Nouns precede their modifiers in elicited speech.")
    ).toBeInTheDocument();
    expect(within(draftQueue).getByText("medium confidence")).toBeInTheDocument();
  });

  it("renders per-source processing warnings only for sources that carry them", async () => {
    apiMock.fetchSources.mockResolvedValue([createTextSourceWithWarnings(), createAudioSource()]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const sourcesRegion = await screen.findByRole("region", { name: "Registered sources" });
    await waitFor(() => expect(apiMock.fetchSources).toHaveBeenCalledWith("avenik"));

    const warnedSource = within(sourcesRegion).getByRole("list", {
      name: "Processing warnings for Field notebook page"
    });
    expect(
      within(warnedSource).getByText("Processing fell back to offline heuristics; review extracted drafts carefully.")
    ).toBeInTheDocument();

    expect(
      within(sourcesRegion).queryByRole("list", { name: "Processing warnings for Elder recording" })
    ).not.toBeInTheDocument();
  });

  it("registers a text source from the intake form and refreshes the source list", async () => {
    apiMock.fetchSources.mockResolvedValueOnce([]).mockResolvedValue([createTextSource()]);
    apiMock.registerSource.mockResolvedValue(createTextSource());

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const intakeForm = await screen.findByRole("form", { name: "Register source" });
    fireEvent.change(within(intakeForm).getByLabelText("Source kind"), { target: { value: "text" } });
    fireEvent.change(within(intakeForm).getByLabelText("Source title"), {
      target: { value: "Field notebook page" }
    });
    fireEvent.change(within(intakeForm).getByLabelText("Raw text"), {
      target: { value: "tala = water" }
    });
    fireEvent.click(within(intakeForm).getByRole("button", { name: "Register source" }));

    await waitFor(() =>
      expect(apiMock.registerSource).toHaveBeenCalledWith("avenik", {
        kind: "text",
        title: "Field notebook page",
        rawText: "tala = water"
      })
    );
    expect(await screen.findByText("Source registered: Field notebook page.")).toBeInTheDocument();
    const sourcesRegion = screen.getByRole("region", { name: "Registered sources" });
    expect(await within(sourcesRegion).findByText("Field notebook page")).toBeInTheDocument();
  });

  it("uploads a source file and lets the API decide the source kind", async () => {
    apiMock.fetchSources.mockResolvedValueOnce([]).mockResolvedValue([createAudioSource()]);
    apiMock.uploadSourceFile.mockResolvedValue(createAudioSource());

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const uploadForm = await screen.findByRole("form", { name: "Upload source file" });
    const file = new File(["audio-bytes"], "elder.mp3", { type: "audio/mpeg" });
    fireEvent.change(within(uploadForm).getByLabelText("Upload title (optional)"), {
      target: { value: "Elder recording" }
    });
    fireEvent.change(within(uploadForm).getByLabelText("Source file"), {
      target: { files: [file] }
    });
    fireEvent.click(within(uploadForm).getByRole("button", { name: "Upload source file" }));

    await waitFor(() => expect(apiMock.uploadSourceFile).toHaveBeenCalledWith("avenik", file, "Elder recording"));
    expect(await screen.findByText("File uploaded as audio source: Elder recording.")).toBeInTheDocument();
    const sourcesRegion = screen.getByRole("region", { name: "Registered sources" });
    expect(await within(sourcesRegion).findByText("Elder recording")).toBeInTheDocument();
  });

  it("starts background processing, polls until the source is processed, and refreshes the draft queue", async () => {
    apiMock.fetchSources
      .mockResolvedValueOnce([createTextSource()])
      .mockResolvedValue([{ ...createTextSource(), status: "processed" }]);
    apiMock.fetchExtractionDrafts.mockResolvedValueOnce([]).mockResolvedValue([createLexemeDraft()]);
    apiMock.processSource.mockResolvedValue({
      asset: { ...createTextSource(), status: "processing" },
      drafts: [],
      warnings: []
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Process Field notebook page" }));

    await waitFor(() => expect(apiMock.processSource).toHaveBeenCalledWith("src-1", { async: true }));
    expect(await screen.findByText("Processing Field notebook page finished.")).toBeInTheDocument();
    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(await within(draftQueue).findByText("tala — water")).toBeInTheDocument();
    expect(apiMock.fetchSources).toHaveBeenLastCalledWith("avenik");
    expect(apiMock.fetchExtractionDrafts).toHaveBeenLastCalledWith("avenik", "proposed");
    const sourcesRegion = screen.getByRole("region", { name: "Registered sources" });
    expect(within(sourcesRegion).getByRole("button", { name: "Process Field notebook page" })).toBeEnabled();
  });

  it("keeps the source marked as processing while polling and surfaces the stored error on failure", async () => {
    const pendingPoll = createDeferred<unknown>();
    apiMock.fetchSources
      .mockResolvedValueOnce([createTextSource()])
      .mockImplementationOnce(() => pendingPoll.promise)
      .mockResolvedValue([
        {
          ...createTextSource(),
          status: "failed",
          error: "The document contains no extractable text."
        }
      ]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.processSource.mockResolvedValue({
      asset: { ...createTextSource(), status: "processing" },
      drafts: [],
      warnings: []
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Process Field notebook page" }));

    await waitFor(() => expect(apiMock.processSource).toHaveBeenCalledWith("src-1", { async: true }));

    // The first poll is still in flight: the row stays busy and disabled.
    await waitFor(() => expect(apiMock.fetchSources).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Processing..." })).toBeDisabled();

    // The poll reports "processing", so polling continues; the next poll
    // returns the stored failure.
    pendingPoll.resolve([{ ...createTextSource(), status: "processing" }]);

    const failureMessages = await screen.findAllByText("The document contains no extractable text.", undefined, {
      timeout: 4000
    });
    expect(failureMessages.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Retry Field notebook page" })).toBeEnabled();
  }, 10000);

  it("surfaces the localized max-attempt error through the App ingest flow", async () => {
    const MAX_ATTEMPTS = 5;
    apiMock.fetchSources.mockResolvedValue([
      {
        ...createTextSource(),
        status: "failed",
        processingAttempts: MAX_ATTEMPTS - 1
      }
    ]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.processSource.mockRejectedValue(
      new ApiError(`Source processing attempt limit reached (${MAX_ATTEMPTS}).`, {
        status: 409,
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: MAX_ATTEMPTS, count: MAX_ATTEMPTS }
      })
    );

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry Field notebook page" }));

    expect(
      await screen.findByText(
        `Processing stopped after ${MAX_ATTEMPTS} attempts. Review the source error or contact an operator.`
      )
    ).toBeInTheDocument();
  });

  it("shows a duplicate warning badge on flagged drafts and none on unflagged drafts", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([
      { ...createLexemeDraft(), duplicate: { kind: "exact", entityId: "lex-9" } },
      createGrammarDraft()
    ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const draftQueue = await screen.findByRole("region", { name: "Extraction draft queue" });
    const flaggedRow = await within(draftQueue).findByRole("article", { name: "Extraction draft draft-1" });
    expect(within(flaggedRow).getByText("Duplicate of existing entry")).toBeInTheDocument();

    const unflaggedRow = within(draftQueue).getByRole("article", { name: "Extraction draft draft-2" });
    expect(
      within(unflaggedRow).queryByText(
        /Duplicate of existing entry|Same form, different gloss|Duplicate topic|Duplicates another pending draft/
      )
    ).not.toBeInTheDocument();
  });

  it("accepts a proposed extraction draft and refreshes the queue", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValueOnce([createLexemeDraft()]).mockResolvedValue([]);
    apiMock.acceptExtractionDraft.mockResolvedValue({
      draft: { ...createLexemeDraft(), status: "accepted", committedEntityId: "lex-1" },
      entity: {
        id: "lex-1",
        languageId: "avenik",
        form: "tala",
        gloss: "water",
        partOfSpeech: "noun",
        tags: [],
        sourceAssetIds: ["src-1"]
      }
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Accept draft draft-1" }));

    await waitFor(() => expect(apiMock.acceptExtractionDraft).toHaveBeenCalledWith("draft-1", undefined));
    expect(await screen.findByText("Draft accepted: Lexeme committed.")).toBeInTheDocument();
    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(await within(draftQueue).findByText("0 proposed drafts")).toBeInTheDocument();
    expect(apiMock.rejectExtractionDraft).not.toHaveBeenCalled();
  });

  it("rejects a proposed extraction draft and refreshes the queue", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValueOnce([createGrammarDraft()]).mockResolvedValue([]);
    apiMock.rejectExtractionDraft.mockResolvedValue({
      ...createGrammarDraft(),
      status: "rejected"
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Reject draft draft-2" }));

    await waitFor(() => expect(apiMock.rejectExtractionDraft).toHaveBeenCalledWith("draft-2"));
    expect(await screen.findByText("Draft rejected: Grammar note.")).toBeInTheDocument();
    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(await within(draftQueue).findByText("0 proposed drafts")).toBeInTheDocument();
    expect(apiMock.acceptExtractionDraft).not.toHaveBeenCalled();
  });
});
