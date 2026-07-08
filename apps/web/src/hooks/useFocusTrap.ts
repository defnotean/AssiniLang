import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    // offsetParent is null for hidden elements (and position:fixed roots in some engines);
    // also accept elements that still report a layout box.
    return element.offsetParent !== null || element.getClientRects().length > 0;
  });
}

/**
 * Traps Tab / Shift+Tab inside a dialog container and restores focus to the
 * previously focused element when the trap unmounts or becomes inactive.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const trapRoot = containerRef.current;
    if (!trapRoot) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = getFocusableElements(trapRoot);
    if (!trapRoot.contains(document.activeElement)) {
      focusables[0]?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const items = getFocusableElements(root);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeElement = document.activeElement;
      if (event.shiftKey) {
        if (activeElement === first || !root.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last || !root.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [containerRef, active]);
}
