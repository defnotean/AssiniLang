/** Stable focus targets for command-palette workflow jumps. */
export const WORKSPACE_FOCUS = {
  practiceAuthoring: "exercise-author-prompt",
  corpusBulkImport: "corpus-bulk-paste",
  phonologyEditor: "phonology-consonant-input",
  modelSetup: "model-provider"
} as const;

export type WorkspaceFocusId = (typeof WORKSPACE_FOCUS)[keyof typeof WORKSPACE_FOCUS];

/** Fired before focusing the bulk corpus paste field so CorpusView can expand the panel. */
export const OPEN_CORPUS_BULK_EVENT = "assinilang:open-corpus-bulk";

/** Focus a workspace control after a view switch paints the target DOM. */
export function scheduleWorkspaceFocus(elementId: WorkspaceFocusId | string, attempts = 16): void {
  const needsBulkOpen = elementId === WORKSPACE_FOCUS.corpusBulkImport;
  let remaining = attempts;

  const tryFocus = () => {
    if (needsBulkOpen) {
      window.dispatchEvent(new CustomEvent(OPEN_CORPUS_BULK_EVENT));
    }

    const element = document.getElementById(elementId);
    if (element instanceof HTMLElement) {
      element.scrollIntoView?.({ behavior: "smooth", block: "center" });
      if (typeof element.focus === "function") {
        element.focus();
      }
      return;
    }

    remaining -= 1;
    if (remaining <= 0) return;
    window.requestAnimationFrame(tryFocus);
  };

  window.requestAnimationFrame(tryFocus);
}
