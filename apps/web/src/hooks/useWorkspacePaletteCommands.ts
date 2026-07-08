import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { PaletteCommand } from "../components/CommandPalette";
import type { Translate } from "../i18n";
import type { Language, Theme, ViewMode } from "../lib/types";
import { VIEW_ORDER } from "../lib/viewConfig";

type UseWorkspacePaletteCommandsParams = {
  workspace: { languages: Language[] } | null;
  t: Translate;
  onLanguageSelect: (languageId: Language["id"]) => void;
  onViewSelect: (mode: ViewMode) => void;
  setTheme: Dispatch<SetStateAction<Theme>>;
};

export function useWorkspacePaletteCommands({
  workspace,
  t,
  onLanguageSelect,
  onViewSelect,
  setTheme
}: UseWorkspacePaletteCommandsParams): PaletteCommand[] {
  return useMemo<PaletteCommand[]>(() => {
    const languageCommands: PaletteCommand[] = (workspace?.languages ?? []).map((language) => ({
      id: `language-${language.id}`,
      label: t("palette.goTo", { name: language.name }),
      run: () => onLanguageSelect(language.id)
    }));
    const viewCommands: PaletteCommand[] = VIEW_ORDER.map((mode) => ({
      id: `view-${mode}`,
      label: t("palette.open", { label: t(`viewConfig.${mode}.label`) }),
      run: () => onViewSelect(mode)
    }));
    return [
      ...languageCommands,
      ...viewCommands,
      {
        id: "toggle-theme",
        label: t("palette.toggleTheme"),
        run: () => setTheme((current) => (current === "dark" ? "light" : "dark"))
      }
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, t]);
}
