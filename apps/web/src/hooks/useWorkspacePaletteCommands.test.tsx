import "@testing-library/jest-dom/vitest";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../i18n";
import type { Language } from "../lib/types";
import * as workspaceFocus from "../lib/workspaceFocus";
import { WORKSPACE_FOCUS } from "../lib/workspaceFocus";
import { useWorkspacePaletteCommands } from "./useWorkspacePaletteCommands";

const languages = [
  {
    id: "lang-avenik",
    name: "Avenik",
    description: "Test language",
    orthography: "Latin",
    status: "draft" as const,
    typology: "unknown" as const
  }
] as Language[];

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPaletteCommands(locale: "en" = "en") {
  const onLanguageSelect = vi.fn();
  const onViewSelect = vi.fn();
  const setTheme = vi.fn();
  const { result } = renderHook(
    () => {
      const { t } = useI18n();
      return useWorkspacePaletteCommands({
        workspace: { languages },
        t,
        onLanguageSelect,
        onViewSelect,
        setTheme
      });
    },
    {
      wrapper: ({ children }) => <I18nProvider initialLocale={locale}>{children}</I18nProvider>
    }
  );
  return { commands: result.current, onLanguageSelect, onViewSelect, setTheme };
}

describe("useWorkspacePaletteCommands", () => {
  it("includes tab opens plus deep workflow jumps", () => {
    const { commands } = renderPaletteCommands();
    const labels = commands.map((command) => command.label);

    expect(labels).toContain("Open Build");
    expect(labels).toContain("Open Practice");
    expect(labels).toContain("Open Settings");
    expect(labels).toContain("Jump to Practice authoring");
    expect(labels).toContain("Jump to bulk corpus import");
    expect(labels).toContain("Jump to phonology editor");
    expect(labels).toContain("Go to Avenik");
    expect(labels).toContain("Toggle theme");
  });

  it("jumps to Practice authoring and focuses the prompt field", () => {
    const scheduleSpy = vi.spyOn(workspaceFocus, "scheduleWorkspaceFocus").mockImplementation(() => undefined);
    const { commands, onViewSelect } = renderPaletteCommands();

    commands.find((command) => command.id === "jump-practice-authoring")?.run();

    expect(onViewSelect).toHaveBeenCalledWith("learner");
    expect(scheduleSpy).toHaveBeenCalledWith(WORKSPACE_FOCUS.practiceAuthoring);
  });

  it("jumps to bulk corpus import and phonology editor on Start", () => {
    const scheduleSpy = vi.spyOn(workspaceFocus, "scheduleWorkspaceFocus").mockImplementation(() => undefined);
    const { commands, onViewSelect } = renderPaletteCommands();

    commands.find((command) => command.id === "jump-corpus-bulk-import")?.run();
    expect(onViewSelect).toHaveBeenCalledWith("profile");
    expect(scheduleSpy).toHaveBeenCalledWith(WORKSPACE_FOCUS.corpusBulkImport);

    commands.find((command) => command.id === "jump-phonology-editor")?.run();
    expect(scheduleSpy).toHaveBeenCalledWith(WORKSPACE_FOCUS.phonologyEditor);
  });

  it("opens Settings and focuses model setup", () => {
    const scheduleSpy = vi.spyOn(workspaceFocus, "scheduleWorkspaceFocus").mockImplementation(() => undefined);
    const { commands, onViewSelect } = renderPaletteCommands();

    commands.find((command) => command.id === "view-model")?.run();

    expect(onViewSelect).toHaveBeenCalledWith("model");
    expect(scheduleSpy).toHaveBeenCalledWith(WORKSPACE_FOCUS.modelSetup);
  });
});
