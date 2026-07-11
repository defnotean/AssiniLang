import {
  EVALUATION_ARTIFACT_HASH,
  EXPORT_REDACTION_POLICY,
  SNAPSHOT_HASH,
  cleanupAppTest,
  createAudioSource,
  createDashboardData,
  createDeferred,
  createDeterministicLlmStatus,
  createGrammarDraft,
  createLanguageProfile,
  createLexemeDraft,
  createModelDiscoveryResponse,
  createModelProfile,
  createRealLlmStatus,
  createRuntimeSettingsResponse,
  createTextSource,
  createTextSourceWithWarnings,
  getApiMock,
  renderReady,
  selectAvenik,
  setupAppTest
} from "./App.testHarness";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, getInitialTheme } from "./App";
import { ApiError } from "./lib/apiClient";
import { en } from "./i18n/en";

const apiMock = getApiMock();
describe("App", () => {
  beforeEach(setupAppTest);
  afterEach(cleanupAppTest);

  it("renders the Atlas language sidebar, local prototype notice, and corpus surface", async () => {
    await renderReady();

    expect(await screen.findByText("Local Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Local prototype")).toBeInTheDocument();
    expect(screen.getByText("all data stays on this machine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Avenik.*agglutinative/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Solari.*isolating/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Build" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corpus Browser" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Note Review Queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Model Setup" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Corpus passages" })).toBeInTheDocument();
    expect(screen.getByText("mira talo-mi-na")).toBeInTheDocument();
    expect(apiMock.fetchCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("reads the initial theme from injected browser storage without requiring Node web storage", () => {
    expect(getInitialTheme({ getItem: () => "light" })).toBe("light");
    expect(getInitialTheme({ getItem: () => "dark" })).toBe("dark");
    expect(getInitialTheme({ getItem: () => "unexpected" })).toBe("dark");
    expect(getInitialTheme()).toBe("dark");
  });

  it("exposes theme toggle switch state and flips the document theme", async () => {
    await renderReady();

    const toggle = screen.getByRole("switch", { name: "Dark theme" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveTextContent("Dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveTextContent("Light");
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveTextContent("Dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("moves focus to main content when the skip link is activated", async () => {
    await renderReady();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const main = document.getElementById("main-content");
    expect(main).not.toBeNull();
    if (main) main.scrollTop = 240;

    fireEvent.click(skip);

    expect(document.activeElement).toBe(main);
    expect(main).toHaveProperty("scrollTop", 0);
  });

  it("exposes section navigation as a labeled group without nested nav landmarks", async () => {
    await renderReady();

    expect(screen.getByRole("navigation", { name: "Languages" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Avenik sections" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Avenik sections" })).not.toBeInTheDocument();
  });

  it("filters corpus passages and renders morpheme chips from API data", async () => {
    await renderReady();

    const search = screen.getByRole("searchbox", { name: "Search corpus" });
    fireEvent.change(search, { target: { value: "river" } });

    expect(screen.getByText("1 of 1 passages")).toBeInTheDocument();
    expect(screen.getByText("mira")).toBeInTheDocument();
    expect(screen.getByText("river")).toBeInTheDocument();
    expect(screen.getByText("talo")).toBeInTheDocument();
    expect(screen.getByText("walk")).toBeInTheDocument();
  });

  it("imports corpus passages from the Start and refreshes the source list", async () => {
    const initialData = createDashboardData();
    const createdPassage = {
      id: "imported-corpus-avenik-2",
      languageId: "avenik",
      source: "field-lab",
      sourceMetadata: {
        author: "reviewer-1",
        year: 2026,
        license: "cc-by",
        consentRecord: "local-review"
      },
      textTarget: "mira lumo-ke talo-mi-na",
      textTranslation: "I walk by the river near the practice mat.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "river", gloss: "river", features: ["noun"] },
        { surface: "lumo-ke", lemma: "practice mat", gloss: "mat-near", features: ["locative"] },
        { surface: "talo-mi-na", lemma: "walk", gloss: "walk-present-1sg", features: ["present", "1sg"] }
      ],
      topicTags: ["movement", "locative"],
      consentStatus: {
        use: "community-approved" as const,
        restrictions: ["internal-only"]
      }
    };

    apiMock.fetchDashboardData
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce({
        ...initialData,
        corpus: [...initialData.corpus, createdPassage]
      });
    apiMock.importCorpusPassage.mockResolvedValue(createdPassage);

    render(<App />);
    await selectAvenik();

    fireEvent.click(screen.getByRole("button", { name: /add source passage/i }));
    fireEvent.change(screen.getByLabelText("Corpus target text"), {
      target: { value: "mira lumo-ke talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("English translation"), {
      target: { value: "I walk by the river near the practice mat." }
    });
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "field-lab" }
    });
    fireEvent.change(screen.getByLabelText("Author"), {
      target: { value: "reviewer-1" }
    });
    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2026" }
    });
    fireEvent.change(screen.getByLabelText("License"), {
      target: { value: "cc-by" }
    });
    fireEvent.change(screen.getByLabelText("Consent record"), {
      target: { value: "local-review" }
    });
    fireEvent.change(screen.getByLabelText("Topic tags"), {
      target: { value: "movement, locative" }
    });
    fireEvent.change(screen.getByLabelText("Morpheme segmentation"), {
      target: {
        value: [
          "mira | river | river | noun",
          "lumo-ke | practice mat | mat-near | locative",
          "talo-mi-na | walk | walk-present-1sg | present, 1sg"
        ].join("\n")
      }
    });
    fireEvent.change(screen.getByLabelText("Access restrictions"), {
      target: { value: "internal-only" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import passage" }));

    await waitFor(() =>
      expect(apiMock.importCorpusPassage).toHaveBeenCalledWith("avenik", {
        source: "field-lab",
        sourceMetadata: {
          author: "reviewer-1",
          year: 2026,
          license: "cc-by",
          consentRecord: "local-review"
        },
        textTarget: "mira lumo-ke talo-mi-na",
        textTranslation: "I walk by the river near the practice mat.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "river", gloss: "river", features: ["noun"] },
          { surface: "lumo-ke", lemma: "practice mat", gloss: "mat-near", features: ["locative"] },
          { surface: "talo-mi-na", lemma: "walk", gloss: "walk-present-1sg", features: ["present", "1sg"] }
        ],
        topicTags: ["movement", "locative"],
        consentStatus: {
          use: "community-approved",
          restrictions: ["internal-only"]
        }
      })
    );
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
    expect(await screen.findByText("Corpus passage imported.")).toBeInTheDocument();
    expect(await screen.findByText("mira lumo-ke talo-mi-na")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 passages")).toBeInTheDocument();
  });

  it("announces loading state through a live status region", async () => {
    const initialLoad = createDeferred<ReturnType<typeof createDashboardData>>();
    apiMock.fetchDashboardData.mockReturnValue(initialLoad.promise);

    render(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading workspace...");

    initialLoad.resolve(createDashboardData());
    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
  });

  it("announces load errors through an alert region", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Workspace data unavailable"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace data unavailable");
  });

  it("localizes expired prototype sessions when dashboard load is unauthorized", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(
      new ApiError("Request failed: /dashboard (401): Unauthorized", { status: 401 })
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
  });

  it("does not show desktop reconnect guidance for expired sessions in AssiniLang Desktop", async () => {
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        authToken: "desktop-token",
        prototypeAuth: true
      }
    });
    apiMock.fetchDashboardData.mockRejectedValue(
      new ApiError("Request failed: /dashboard (401): Unauthorized", { status: 401 })
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
    expect(
      screen.queryByText(
        "AssiniLang Desktop could not reach the local API. Restart the app or open Settings → Desktop app to verify the data folder."
      )
    ).not.toBeInTheDocument();
  });

  it("shows desktop reconnect guidance when the workspace fails to load in AssiniLang Desktop", async () => {
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        authToken: "desktop-token",
        prototypeAuth: true
      }
    });
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Could not connect to the local API"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect to the local API");
    expect(
      screen.getByText(
        "AssiniLang Desktop could not reach the local API. Restart the app or open Settings → Desktop app to verify the data folder."
      )
    ).toBeInTheDocument();
  });

  it("shows a desktop offline banner when the browser reports no network", async () => {
    const onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false
    });
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        authToken: "desktop-token",
        prototypeAuth: true
      }
    });

    await renderReady();

    const banner = screen.getByText("Network offline").closest("[role='status']");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveTextContent(
      "AssiniLang Desktop keeps data local, but the workspace needs the embedded API. Reconnect, then press Retry if loading fails."
    );

    if (onlineDescriptor) {
      Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
    }
  });

  it("navigates between the four simplified tabs", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Build" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Review queue" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Registered sources" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Extraction draft queue" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Practice" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Exercise answer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run System Eval" })).toBeInTheDocument();
    expect(await screen.findByText("Avenik evaluation completed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Data Stewardship Policy" })).toBeInTheDocument();
    expect(await screen.findByText("Only reviewers may approve community notes.")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "LLM provider readiness" })).toBeInTheDocument();
  });

  it("keeps primary navigation reachable while hiding language-only chrome in an empty workspace", async () => {
    apiMock.fetchDashboardData.mockResolvedValue({
      ...createDashboardData(),
      languages: [],
      corpus: [],
      notes: [],
      exercises: [],
      evaluations: []
    });
    render(<App />);

    expect(await screen.findByRole("group", { name: "Workspace overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Build" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Practice" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
    expect(screen.queryByLabelText("Selected language metadata")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Current language overview" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Build" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate AI Drafts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft notes with model" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run System Eval" })).not.toBeInTheDocument();
  });

  it("renders the simplified Start overview with saved examples", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
    expect(apiMock.fetchLanguageProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Language overview" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Phonology profile" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saved examples" })).toBeInTheDocument();
    expect(screen.getByText("Agglutinative test language.")).toBeInTheDocument();
    expect(screen.getByText("Read and search what you have")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Corpus passages" })).toBeInTheDocument();
    expect(screen.getByText("mira talo-mi-na")).toBeInTheDocument();
    expect(screen.queryByText("This language has no saved material yet.")).not.toBeInTheDocument();
    expect(screen.getByText("No phonology declared yet")).toBeInTheDocument();
    expect(screen.getByText(/Add consonants and vowels below/)).toBeInTheDocument();
  });

  it("saves phonology inventory edits from Start without loading the language profile", async () => {
    const savedLanguage = {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative" as const,
      description: "Agglutinative test language.",
      orthography: "Latin",
      status: "active" as const,
      phonology: {
        consonants: ["m"],
        vowels: ["a"],
        notes: [] as string[]
      }
    };
    apiMock.updateLanguage.mockResolvedValue(savedLanguage);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    const panel = await screen.findByRole("region", { name: "Phonology profile" });
    const form = within(panel).getByRole("form", { name: "Phonology inventory editor" });
    fireEvent.change(within(form).getByLabelText("New consonant symbol"), { target: { value: "m" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add consonant" }));
    fireEvent.change(within(form).getByLabelText("New vowel symbol"), { target: { value: "a" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add vowel" }));
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiMock.updateLanguage).toHaveBeenCalledWith("avenik", {
        phonology: {
          consonants: ["m"],
          vowels: ["a"],
          notes: []
        }
      })
    );
    expect(apiMock.fetchLanguageProfile).not.toHaveBeenCalled();
    expect(await within(form).findByRole("status")).toHaveTextContent("Phonology inventory saved.");
    expect(within(form).getByText("m")).toBeInTheDocument();
    expect(within(form).getByText("a")).toBeInTheDocument();
  });

  it("shows Start next-step guidance when the selected language has no saved material", async () => {
    const emptyLanguageData = {
      ...createDashboardData(),
      corpus: [],
      notes: [],
      exercises: []
    };
    apiMock.fetchDashboardData.mockResolvedValue(emptyLanguageData);
    render(<App />);
    await selectAvenik();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
    const overview = screen.getByRole("region", { name: "Language overview" });
    const emptyState = within(overview).getByRole("status");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent("This language has no saved material yet.");
    expect(emptyState).toHaveTextContent(/Open Build to add a source/);
    expect(emptyState).toHaveTextContent(/Saved examples/);
  });

  it("does not require language profile data to render Start", async () => {
    apiMock.fetchLanguageProfile.mockResolvedValue({
      ...createLanguageProfile(),
      phonology: null
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
    expect(apiMock.fetchLanguageProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Saved examples" })).toBeInTheDocument();
  });

  it("creates a language from the sidebar and selects the new workspace", async () => {
    const createdLanguage = {
      id: "rivertongue",
      name: "Rivertongue",
      typology: "isolating",
      description: "Community river language.",
      orthography: "Latin",
      status: "draft"
    };
    apiMock.createLanguage.mockResolvedValue(createdLanguage);
    apiMock.fetchDashboardData.mockImplementation(async (languageId?: string) => {
      const base = createDashboardData();
      if (languageId === "rivertongue") {
        return {
          ...base,
          languages: [...base.languages, createdLanguage],
          corpus: [],
          notes: [],
          exercises: []
        };
      }
      return base;
    });

    render(<App />);
    await screen.findByText("Avenik / Start");

    fireEvent.click(screen.getByRole("button", { name: "New language" }));
    const createForm = await screen.findByRole("form", { name: "Create language" });
    fireEvent.change(within(createForm).getByLabelText("Language name"), {
      target: { value: "Rivertongue" }
    });
    fireEvent.change(within(createForm).getByLabelText("Description"), {
      target: { value: "Community river language." }
    });
    fireEvent.change(within(createForm).getByLabelText("Orthography"), {
      target: { value: "Latin" }
    });
    fireEvent.change(within(createForm).getByLabelText("Typology"), {
      target: { value: "isolating" }
    });
    fireEvent.click(within(createForm).getByRole("button", { name: "Create language" }));

    await waitFor(() =>
      expect(apiMock.createLanguage).toHaveBeenCalledWith({
        name: "Rivertongue",
        description: "Community river language.",
        orthography: "Latin",
        typology: "isolating"
      })
    );
    await waitFor(() => expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("rivertongue"));
    expect(await screen.findByText("Rivertongue / Start")).toBeInTheDocument();
  });

  it("deletes a language from the sidebar after name confirmation", async () => {
    let deleted = false;
    apiMock.deleteLanguage.mockImplementation(async (languageId: string) => {
      deleted = true;
      return {
        id: languageId,
        name: "Avenik",
        deleted: true as const
      };
    });
    apiMock.fetchDashboardData.mockImplementation(async (languageId?: string) => {
      const base = createDashboardData();
      if (deleted && languageId === undefined) {
        return {
          ...base,
          languages: [],
          corpus: [],
          notes: [],
          exercises: []
        };
      }
      return base;
    });

    render(<App />);
    await selectAvenik();

    fireEvent.click(screen.getByRole("button", { name: "Delete language" }));
    const deleteForm = await screen.findByRole("form", { name: "Delete language" });
    fireEvent.change(within(deleteForm).getByLabelText("Type the language name to confirm"), {
      target: { value: "Avenik" }
    });
    fireEvent.click(within(deleteForm).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(apiMock.deleteLanguage).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(apiMock.fetchDashboardData).toHaveBeenCalled());
  });

  it("creates governance policy records for the selected language", async () => {
    apiMock.fetchGovernance
      .mockResolvedValueOnce([
        {
          id: "governance-1",
          languageId: "avenik",
          policyType: "access",
          content: "Only reviewers may approve community notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "governance-1",
          languageId: "avenik",
          policyType: "access",
          content: "Only reviewers may approve community notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        },
        {
          id: "governance-2",
          languageId: "avenik",
          policyType: "generation",
          content: "Generated outputs must cite reviewed notes.",
          effectiveDate: "2026-06-06",
          approvedBy: "lead-1"
        }
      ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Only reviewers may approve community notes.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Policy type"), { target: { value: "generation" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText("Policy content"), {
      target: { value: "Generated outputs must cite reviewed notes." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create policy record" }));

    await waitFor(() =>
      expect(apiMock.createGovernanceRecord).toHaveBeenCalledWith({
        languageId: "avenik",
        policyType: "generation",
        content: "Generated outputs must cite reviewed notes.",
        effectiveDate: "2026-06-06"
      })
    );
    expect(await screen.findByText("Governance policy recorded.")).toBeInTheDocument();
    expect(await screen.findByText("Generated outputs must cite reviewed notes.")).toBeInTheDocument();
  });

  it("updates the review policy for the selected language", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByDisplayValue("reviewer-1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assigned reviewer IDs"), {
      target: { value: "reviewer-1, elder-1" }
    });
    fireEvent.change(screen.getByLabelText("Approval threshold"), {
      target: { value: "2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Update review policy" }));

    await waitFor(() =>
      expect(apiMock.updateReviewPolicy).toHaveBeenCalledWith("avenik", {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      })
    );
    expect(await screen.findByText("Review policy updated.")).toBeInTheDocument();
    expect(screen.getByText("2 approvals required")).toBeInTheDocument();
  });

  it("loads and resolves open review disposition work from governance", async () => {
    const openDisposition = {
      id: "review-disposition-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      disposition: "escalated",
      status: "open",
      reason: "Needs Elder confirmation before approval.",
      assignedTo: "elder-1",
      dueAt: "2026-06-20",
      openedAt: "2026-06-06T00:00:00.000Z",
      openedBy: "reviewer-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null
    };
    const resolvedDisposition = {
      ...openDisposition,
      status: "resolved",
      resolvedAt: "2026-06-06T00:05:00.000Z",
      resolvedBy: "lead-1",
      resolutionSummary: "Resolved from governance review."
    };
    apiMock.fetchReviewDispositions
      .mockResolvedValueOnce([openDisposition])
      .mockResolvedValueOnce([resolvedDisposition]);
    apiMock.resolveReviewDisposition.mockResolvedValue(resolvedDisposition);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const ledger = await screen.findByRole("region", { name: "Review disposition work" });
    expect(apiMock.fetchReviewDispositions).toHaveBeenCalledWith("avenik");
    expect(within(ledger).getByText("Escalated")).toBeInTheDocument();
    expect(within(ledger).getByText("Note: avn-rule-verb-chain-note")).toBeInTheDocument();
    expect(within(ledger).getByText("Assigned to elder-1")).toBeInTheDocument();
    expect(within(ledger).getByText("Due 2026-06-20")).toBeInTheDocument();
    expect(within(ledger).getByText("Needs Elder confirmation before approval.")).toBeInTheDocument();

    fireEvent.change(within(ledger).getByLabelText("Resolution summary for review-disposition-1"), {
      target: { value: "Resolved from governance review." }
    });
    fireEvent.click(within(ledger).getByRole("button", { name: "Resolve review-disposition-1" }));

    await waitFor(() =>
      expect(apiMock.resolveReviewDisposition).toHaveBeenCalledWith(
        "review-disposition-1",
        "Resolved from governance review."
      )
    );
    expect(await within(ledger).findByText("Review disposition resolved.")).toBeInTheDocument();
    expect(await within(ledger).findByText("Resolved by lead-1")).toBeInTheDocument();
    expect(apiMock.fetchReviewDispositions).toHaveBeenLastCalledWith("avenik");
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("loads the selected language audit ledger from governance", async () => {
    apiMock.fetchAuditEvents.mockResolvedValue([
      {
        id: "audit-1",
        at: "2026-06-06T00:10:00.000Z",
        actorId: "lead-1",
        actorRole: "lead",
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: "governance-1",
        languageId: "avenik",
        summary: "Created generation governance policy record.",
        metadata: { policyType: "generation" }
      },
      {
        id: "audit-2",
        at: "2026-06-06T00:11:00.000Z",
        actorId: "reviewer-1",
        actorRole: "reviewer",
        action: "note.reviewed",
        entityType: "note",
        entityId: "avn-rule-verb-chain-note",
        languageId: "avenik",
        summary: "Reviewed note avn-rule-verb-chain-note.",
        metadata: { status: "under_review" }
      }
    ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const auditLedger = await screen.findByRole("region", { name: "Audit event ledger" });
    expect(apiMock.fetchAuditEvents).toHaveBeenCalledWith("avenik");
    expect(within(auditLedger).getByText("Governance record created")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Lead")).toBeInTheDocument();
    expect(within(auditLedger).getByText("lead-1")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Governance record / governance-1")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Created Generation governance policy record.")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Note reviewed")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Reviewer")).toBeInTheDocument();
    expect(within(auditLedger).getByText("reviewer-1")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Note / avn-rule-verb-chain-note")).toBeInTheDocument();
  });

  it("loads lead-only audit events after reviewer-scoped governance requests settle", async () => {
    const reviewPolicy = createDeferred<unknown>();
    const reviewDispositions = createDeferred<unknown[]>();
    apiMock.fetchReviewPolicy.mockReturnValue(reviewPolicy.promise);
    apiMock.fetchReviewDispositions.mockReturnValue(reviewDispositions.promise);
    apiMock.fetchAuditEvents.mockResolvedValue([]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => expect(apiMock.fetchReviewPolicy).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(apiMock.fetchReviewDispositions).toHaveBeenCalledWith("avenik"));
    expect(apiMock.fetchAuditEvents).not.toHaveBeenCalled();

    reviewPolicy.resolve({
      id: "review-policy-avenik",
      languageId: "avenik",
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedAt: "2026-06-06T00:00:00.000Z",
      updatedBy: "lead-1"
    });
    reviewDispositions.resolve([]);

    await waitFor(() => expect(apiMock.fetchAuditEvents).toHaveBeenCalledWith("avenik"));
  });

  it("exports a downloadable review snapshot for the selected language", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.click(await screen.findByRole("button", { name: "Export review snapshot" }));

    await waitFor(() => expect(apiMock.fetchLanguageSnapshot).toHaveBeenCalledWith("avenik"));
    expect(
      await screen.findByText(
        "Snapshot ready: 1 corpus passage, 2 notes, 2 notes still need review, 2 exercises, 2 vocabulary items, 1 grammar rule, 1 source asset, integrity sha256:0123456789ab."
      )
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download snapshot JSON" });
    expect(link).toHaveAttribute("download", "assini-avenik-snapshot.json");
    expect(link.getAttribute("href")).toContain("data:application/json;charset=utf-8,");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).not.toContain("expectedAnswers");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(SNAPSHOT_HASH);
  });

  it("refreshes the selected language when the language selector changes", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: /Solari.*isolating/i }));

    await waitFor(() => expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("solari"));
    expect(await screen.findByText("Solari / Start")).toBeInTheDocument();
  });

  it("generates draft notes for the selected language and refreshes the review queue", async () => {
    const draftRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateDraftNotes.mockReturnValue(draftRun.promise);

    render(<App />);

    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    const languageButton = await screen.findByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Generate AI Drafts" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Drafting..." })).toBeDisabled());
    expect(languageButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Drafting..." })).toBeDisabled();

    draftRun.resolve([]);

    await waitFor(() => expect(apiMock.generateDraftNotes).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate AI Drafts" })).toBeEnabled());
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("drafts notes with the model and refreshes the review queue", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelDraftNotes.mockResolvedValue({
      notes: [],
      warnings: ["Model returned fewer notes than requested."],
      generated: 2
    });

    render(<App />);

    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Draft notes with model" }));

    await waitFor(() => expect(apiMock.generateModelDraftNotes).toHaveBeenCalledWith("avenik"));
    expect(
      await screen.findByText("Generated 2 model-backed draft notes. Model returned fewer notes than requested.")
    ).toBeInTheDocument();
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("shows the no-model error inline when drafting notes with the model fails", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelDraftNotes.mockRejectedValue(
      new Error("Model draft generation failed (400): No model is configured.")
    );

    render(<App />);

    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Draft notes with model" }));

    await waitFor(() => expect(apiMock.generateModelDraftNotes).toHaveBeenCalledWith("avenik"));
    expect(await screen.findByText("Model draft generation failed (400): No model is configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft notes with model" })).toBeEnabled();
  });

  it("runs evaluation while keeping workspace navigation available", async () => {
    const evaluationRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockReturnValue(evaluationRun.promise);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const languageButton = screen.getByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Run System Eval" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluating..." })).toBeDisabled());
    expect(languageButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Evaluating..." })).toBeDisabled();

    evaluationRun.resolve([]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run System Eval" })).toBeEnabled());
    expect(languageButton).toBeEnabled();
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("exports a downloadable evaluation artifact from the eval view", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.click(await screen.findByRole("button", { name: "Export evaluation artifact" }));

    await waitFor(() => expect(apiMock.fetchEvaluationArtifact).toHaveBeenCalled());
    expect(
      await screen.findByText(
        "Evaluation artifact ready: 1 latest run, 0 failed latest runs, 0 regressed latest runs, 0 failure lines, 85% average latest score, integrity sha256:fedcba987654."
      )
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download evaluation artifact JSON" });
    expect(link).toHaveAttribute("download", "assini-evaluation-artifact.json");
    expect(link.getAttribute("href")).toContain("data:application/json;charset=utf-8,");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).not.toContain("expectedAnswers");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(EVALUATION_ARTIFACT_HASH);
  });

  it("shows latest evaluation trend deltas in the evaluation dashboard", async () => {
    const dashboardData = createDashboardData();
    dashboardData.evaluations = [
      {
        id: "eval-old",
        languageId: "avenik",
        createdAt: "2026-06-02T14:00:00.000Z",
        systemVersion: "test",
        fixtureVersion: "test",
        scores: {
          corpusCoverage: 1,
          noteQuality: 0.9
        },
        failures: [],
        summary: "Avenik previous evaluation completed."
      },
      {
        id: "eval-latest",
        languageId: "avenik",
        createdAt: "2026-06-03T14:00:00.000Z",
        systemVersion: "test",
        fixtureVersion: "test",
        scores: {
          corpusCoverage: 0.9,
          noteQuality: 0.8
        },
        failures: [],
        summary: "Avenik evaluation completed."
      }
    ];
    apiMock.fetchDashboardData.mockResolvedValue(dashboardData);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("region", { name: "Evaluation trends" })).toBeInTheDocument();
    expect(screen.getByText("Avenik regressed by 10 pts since previous run.")).toBeInTheDocument();
    expect(screen.getByText("Note quality -10 pts")).toBeInTheDocument();
    expect(screen.getByText("Corpus coverage -10 pts")).toBeInTheDocument();
  });

  it("reviews elder corrections from the correction ledger", async () => {
    const dashboardData = createDashboardData();
    const pendingCorrection = {
      id: "elder-correction-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      correction: "Mention suffix order before approval.",
      rationale: "Elder review found the explanation underspecified.",
      severity: "major",
      status: "pending_review",
      proposedBy: "elder-1",
      proposedAt: "2026-06-06T00:00:00.000Z",
      reviewedBy: null,
      reviewedAt: null
    };
    const acceptedCorrection = {
      ...pendingCorrection,
      status: "accepted",
      reviewedBy: "lead-1",
      reviewedAt: "2026-06-06T00:01:00.000Z"
    };

    apiMock.fetchElderContext
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: dashboardData.notes,
        corrections: [pendingCorrection],
        governance: []
      })
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: dashboardData.notes,
        corrections: [acceptedCorrection],
        governance: []
      });
    apiMock.reviewElderCorrection.mockResolvedValue(acceptedCorrection);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(await screen.findByText("Mention suffix order before approval.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve this fix" }));

    await waitFor(() => expect(apiMock.reviewElderCorrection).toHaveBeenCalledWith("elder-correction-1", "accepted"));
    expect(await screen.findByText("Approved — we are using this")).toBeInTheDocument();
    expect(screen.getByText("Looked at by lead-1")).toBeInTheDocument();
  });

  it("applies accepted elder corrections to linked notes from the correction ledger", async () => {
    const dashboardData = createDashboardData();
    const revisedExplanation =
      "Avenik verbs use transparent suffix chains, and accepted elder review highlights tense before person.";
    const acceptedCorrection = {
      id: "elder-correction-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      correction: "Mention tense suffix order before person.",
      rationale: "Elder review found the explanation underspecified.",
      severity: "major",
      status: "accepted",
      proposedBy: "elder-1",
      proposedAt: "2026-06-06T00:00:00.000Z",
      reviewedBy: "lead-1",
      reviewedAt: "2026-06-06T00:01:00.000Z"
    };
    const appliedCorrection = {
      ...acceptedCorrection,
      status: "applied"
    };

    apiMock.fetchElderContext
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: dashboardData.notes,
        corrections: [acceptedCorrection],
        governance: []
      })
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: [{ ...dashboardData.notes[0], explanation: revisedExplanation }, dashboardData.notes[1]],
        corrections: [appliedCorrection],
        governance: []
      });
    apiMock.applyElderCorrection.mockResolvedValue({
      correction: appliedCorrection,
      note: { ...dashboardData.notes[0], explanation: revisedExplanation }
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const explanationInput = await screen.findByLabelText("Updated wording for the lesson");
    fireEvent.change(explanationInput, { target: { value: revisedExplanation } });
    fireEvent.click(screen.getByRole("button", { name: "Save into the lesson" }));

    await waitFor(() =>
      expect(apiMock.applyElderCorrection).toHaveBeenCalledWith("elder-correction-1", revisedExplanation)
    );
    expect(await screen.findByText("Saved into the lesson")).toBeInTheDocument();
    expect(screen.getByText("Suggestion saved into the linked lesson.")).toBeInTheDocument();
  });

  const reviewActionCases = [
    {
      action: "approval",
      buttonName: "Approve verb chains",
      reviewerComment: "Approved in local prototype.",
      status: "approved"
    },
    {
      action: "contest",
      buttonName: "Contest verb chains",
      reviewerComment: "Contested in local prototype.",
      status: "contested"
    },
    {
      action: "rejection",
      buttonName: "Reject verb chains",
      reviewerComment: "Rejected in local prototype.",
      status: "rejected"
    },
    {
      action: "deferral",
      buttonName: "Defer verb chains",
      reviewerComment: "Deferred in local prototype.",
      status: "deferred"
    },
    {
      action: "escalation",
      buttonName: "Escalate verb chains",
      reviewerComment: "Escalated in local prototype.",
      status: "escalated"
    }
  ] as const;

  it.each(reviewActionCases)("submits note $action actions and refreshes the selected language", async (reviewCase) => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: reviewCase.buttonName }));

    await waitFor(() =>
      expect(apiMock.reviewNote).toHaveBeenCalledWith("avn-rule-verb-chain-note", {
        status: reviewCase.status,
        reviewerComment: reviewCase.reviewerComment
      })
    );
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("localizes expired-session errors from note review instead of raw API text", async () => {
    apiMock.reviewNote.mockRejectedValue(
      new ApiError("Request failed: /notes/avn-rule-verb-chain-note/review (401): Unauthorized", { status: 401 })
    );

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve verb chains" }));

    expect(
      await screen.findByText(
        "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Unauthorized/i)).not.toBeInTheDocument();
  });

  it("edits the selected note explanation from the review queue", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const revisedExplanation = "Avenik verbs use suffix chains where tense appears before the person suffix.";
    const explanationInput = await screen.findByLabelText("Revised note explanation");
    expect(explanationInput).toHaveValue("Avenik verbs use transparent suffix chains.");

    fireEvent.change(explanationInput, { target: { value: revisedExplanation } });
    fireEvent.click(screen.getByRole("button", { name: "Save note edits" }));

    await waitFor(() =>
      expect(apiMock.reviewNote).toHaveBeenCalledWith("avn-rule-verb-chain-note", {
        explanation: revisedExplanation,
        reviewerComment: "Edited note explanation in local prototype."
      })
    );
    expect(await screen.findByText("Note explanation updated.")).toBeInTheDocument();
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("shows selected note examples, evidence, reviewer info, comments, and edit history", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const detail = await screen.findByRole("article", { name: "Selected note detail" });
    expect(within(detail).getByRole("heading", { name: "verb chains" })).toBeInTheDocument();
    expect(within(detail).getByLabelText("Note examples editor").querySelector("code")?.textContent).toBe(
      "mira talo-mi-na"
    );
    expect(within(detail).getByText("I walk by the river.")).toBeInTheDocument();
    expect(within(detail).getByText("1 evidence link")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c001")).toBeInTheDocument();
    expect(within(detail).getByText("mentor-reviewer")).toBeInTheDocument();
    expect(within(detail).getByText("2026-06-02T15:30:00.000Z")).toBeInTheDocument();
    expect(within(detail).getByText("Check suffix boundaries before approval.")).toBeInTheDocument();
    expect(within(detail).getByText("draft-agent")).toBeInTheDocument();
    expect(within(detail).getByText("Generated from the Avenik grammar fixture.")).toBeInTheDocument();
  });

  it("switches the note detail panel when another note is selected", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: /case particles/ }));

    const detail = screen.getByRole("article", { name: "Selected note detail" });
    expect(within(detail).getByRole("heading", { name: "case particles" })).toBeInTheDocument();
    expect(within(detail).getByText("sela mora-ke")).toBeInTheDocument();
    expect(within(detail).getByText("2 evidence links")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c004")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c005")).toBeInTheDocument();
    expect(within(detail).getByText("Added a second evidence passage.")).toBeInTheDocument();
  });

  it("keeps workspace navigation available while a note review refresh is in flight", async () => {
    const review = createDeferred<unknown>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.reviewNote.mockReturnValue(review.promise);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const languageButton = await screen.findByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Approve verb chains" }));

    await waitFor(() => expect(apiMock.reviewNote).toHaveBeenCalled());
    expect(languageButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Practice" })).toBeEnabled();

    review.resolve({});

    await waitFor(() => expect(languageButton).toBeEnabled());
  });

  it("submits learner exercise answers through the API", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Accepted exercise submission."
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    const answerBox = await screen.findByLabelText("Exercise answer");
    fireEvent.change(answerBox, { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.submitExerciseAnswer).toHaveBeenCalledWith("avn-ex001", "mira talo-mi-na"));
    expect(await screen.findByText("Submission accepted.")).toBeInTheDocument();
  });

  it("shows sanitized exercise submission history and refreshes it after grading", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.fetchExerciseSubmissions
      .mockResolvedValueOnce([
        {
          id: "submission-1",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: false,
          explanation: "Answer did not match the exercise key.",
          submittedAt: "2026-06-03T15:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "submission-2",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: true,
          explanation: "Accepted exercise submission.",
          submittedAt: "2026-06-03T15:01:00.000Z"
        }
      ]);
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Accepted exercise submission."
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    const history = await screen.findByRole("region", { name: "Exercise submission history" });
    expect(await within(history).findByText("Answer did not match the exercise answer key.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Exercise answer"), { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex001"));
    expect(await within(history).findByText("Submission accepted.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();
  });

  it("authors a validated exercise from the learning lab", async () => {
    const createdExercise = {
      id: "authored-exercise-avenik-3",
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"]
    };
    const initialData = createDashboardData();
    const refreshedData = {
      ...initialData,
      exercises: [...initialData.exercises, createdExercise]
    };
    apiMock.fetchDashboardData
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(refreshedData);
    apiMock.createExercise.mockResolvedValue(createdExercise);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.change(await screen.findByLabelText("Exercise prompt"), {
      target: { value: "Translate into Avenik: I walk by the river." }
    });
    fireEvent.change(screen.getByLabelText("Allowed vocabulary"), {
      target: { value: "mira, talo, -mi, -na" }
    });
    fireEvent.click(screen.getByText("Advanced: paste note IDs"));
    fireEvent.change(screen.getByLabelText("Allowed rule IDs"), {
      target: { value: "avn-rule-verb-chain" }
    });
    fireEvent.change(screen.getByLabelText("Expected answers"), {
      target: { value: "mira talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 1"), {
      target: { value: "talo-mi-na mira" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 1"), {
      target: { value: "Moves the finite verb before the locative noun." }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 2"), {
      target: { value: "mira talo-na-mi" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 2"), {
      target: { value: "Reverses tense and person suffix order." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add probe" }));
    fireEvent.change(screen.getByLabelText("Adversarial answer 3"), {
      target: { value: "talo mira-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 3"), {
      target: { value: "Breaks the verb chain into separate words." }
    });
    fireEvent.change(screen.getByLabelText("Grading explanation"), {
      target: { value: "Use mira for river, talo for walk, -mi for present, and -na for first person singular." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create exercise" }));

    await waitFor(() =>
      expect(apiMock.createExercise).toHaveBeenCalledWith("avenik", {
        type: "translate_to_target",
        prompt: "Translate into Avenik: I walk by the river.",
        allowedVocabulary: ["mira", "talo", "-mi", "-na"],
        allowedRuleIds: ["avn-rule-verb-chain"],
        expectedAnswers: ["mira talo-mi-na"],
        adversarialAnswers: [
          { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." },
          { answer: "mira talo-na-mi", reason: "Reverses tense and person suffix order." },
          { answer: "talo mira-mi-na", reason: "Breaks the verb chain into separate words." }
        ],
        gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
      })
    );
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
    expect(await screen.findByText("Exercise authored.")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Translate into Avenik: I walk by the river./ })
    ).toBeInTheDocument();
  });

  it("validates exercise authoring without creating it", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.validateExerciseAuthoring.mockResolvedValue({
      ok: false,
      errors: ["Exercise references unknown rule: missing-rule"],
      warnings: [],
      preview: null
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.change(await screen.findByLabelText("Exercise prompt"), {
      target: { value: "Translate into Avenik: I walk by the river." }
    });
    fireEvent.change(screen.getByLabelText("Allowed vocabulary"), {
      target: { value: "mira, talo, -mi, -na" }
    });
    fireEvent.click(screen.getByText("Advanced: paste note IDs"));
    fireEvent.change(screen.getByLabelText("Allowed rule IDs"), {
      target: { value: "missing-rule" }
    });
    fireEvent.change(screen.getByLabelText("Expected answers"), {
      target: { value: "mira talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 1"), {
      target: { value: "talo-mi-na mira" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 1"), {
      target: { value: "Moves the finite verb before the locative noun." }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 2"), {
      target: { value: "mira talo-na-mi" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 2"), {
      target: { value: "Reverses tense and person suffix order." }
    });
    fireEvent.change(screen.getByLabelText("Grading explanation"), {
      target: { value: "Use mira for river, talo for walk, -mi for present, and -na for first person singular." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate exercise authoring" }));

    await waitFor(() =>
      expect(apiMock.validateExerciseAuthoring).toHaveBeenCalledWith("avenik", {
        type: "translate_to_target",
        prompt: "Translate into Avenik: I walk by the river.",
        allowedVocabulary: ["mira", "talo", "-mi", "-na"],
        allowedRuleIds: ["missing-rule"],
        expectedAnswers: ["mira talo-mi-na"],
        adversarialAnswers: [
          { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." },
          { answer: "mira talo-na-mi", reason: "Reverses tense and person suffix order." }
        ],
        gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
      })
    );
    expect(apiMock.createExercise).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("missing-rule");
  });

  it("pre-fills the authoring form from a model-generated exercise draft without auto-creating it", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelExercise.mockResolvedValue({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate into Avenik: The child sleeps.",
        allowedVocabulary: ["nemi", "lo", "-ki"],
        allowedRuleIds: ["avn-rule-verb-chain"],
        expectedAnswers: ["nemi lo-ki"],
        adversarialAnswers: [
          { answer: "lo-ki nemi", reason: "Fronts the verb ahead of the subject noun." },
          { answer: "nemi-ki lo", reason: "Attaches the tense suffix to the wrong stem." },
          { answer: "nemi lo ki", reason: "Splits the tense suffix into a free particle." }
        ],
        gradingExplanation: "Use nemi for child and lo for sleep with the -ki present suffix."
      },
      warnings: ["Review the allowed vocabulary before saving."]
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.click(await screen.findByRole("button", { name: "Generate with model" }));

    await waitFor(() =>
      expect(apiMock.generateModelExercise).toHaveBeenCalledWith("avenik", {
        type: "translate_to_target"
      })
    );

    expect(await screen.findByLabelText("Exercise prompt")).toHaveValue("Translate into Avenik: The child sleeps.");
    expect(screen.getByLabelText("Allowed vocabulary")).toHaveValue("nemi, lo, -ki");
    expect(screen.getByLabelText("Expected answers")).toHaveValue("nemi lo-ki");
    expect(screen.getByLabelText("Adversarial answer 1")).toHaveValue("lo-ki nemi");
    expect(screen.getByLabelText("Adversarial answer 2")).toHaveValue("nemi-ki lo");
    expect(screen.getByLabelText("Adversarial answer 3")).toHaveValue("nemi lo ki");
    expect(screen.getByLabelText("Adversarial reason 3")).toHaveValue("Splits the tense suffix into a free particle.");
    expect(screen.getByLabelText("Grading explanation")).toHaveValue(
      "Use nemi for child and lo for sleep with the -ki present suffix."
    );
    expect(
      screen.getByText("Draft generated — review before saving. Review the allowed vocabulary before saving.")
    ).toBeInTheDocument();
    expect(apiMock.createExercise).not.toHaveBeenCalled();
  });

  it("shows the no-model error inline when generating an exercise with the model fails", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelExercise.mockRejectedValue(
      new Error("Model exercise generation failed (400): No model is configured.")
    );

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.click(await screen.findByRole("button", { name: "Generate with model" }));

    await waitFor(() =>
      expect(apiMock.generateModelExercise).toHaveBeenCalledWith("avenik", {
        type: "translate_to_target"
      })
    );
    expect(
      await screen.findByText("Model exercise generation failed. Retry, or author the exercise manually.")
    ).toBeInTheDocument();
    expect(apiMock.createExercise).not.toHaveBeenCalled();
  });

  it("switches learner exercise selection and loads that exercise history", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    fireEvent.click(await screen.findByRole("button", { name: /Segment: nemi-lo-ki/ }));

    expect(await screen.findByRole("heading", { name: "Segment: nemi-lo-ki" })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex002"));
  });
});
