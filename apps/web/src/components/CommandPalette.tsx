import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useI18n } from "../i18n";

export type PaletteCommand = {
  id: string;
  label: string;
  run: () => void;
};

function matchesQuery(label: string, query: string): boolean {
  const haystack = label.toLowerCase();
  if (haystack.includes(query)) return true;
  // Fuzzy subsequence fallback: every query character appears in order.
  let cursor = 0;
  for (const char of query) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

export function CommandPalette({
  commands,
  onClose
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useFocusTrap(dialogRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => matchesQuery(command.label, normalized));
  }, [commands, query]);

  const clampedIndex = filtered.length === 0 ? 0 : Math.min(selectedIndex, filtered.length - 1);

  function runCommand(command: PaletteCommand) {
    command.run();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex(filtered.length === 0 ? 0 : (clampedIndex + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(filtered.length === 0 ? 0 : (clampedIndex - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[clampedIndex];
      if (command) runCommand(command);
    }
  }

  const activeOptionId = filtered[clampedIndex] ? `palette-option-${filtered[clampedIndex].id}` : undefined;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.aria")}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <label className="visually-hidden" htmlFor="command-palette-input">
          {t("palette.searchLabel")}
        </label>
        <input
          id="command-palette-input"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
        />
        <ul className="palette-list" id="command-palette-list" role="listbox" aria-label={t("palette.listAria")}>
          {filtered.length === 0 ? (
            <li className="palette-empty" aria-disabled="true">
              {t("palette.empty")}
            </li>
          ) : (
            filtered.map((command, index) => (
              <li
                key={command.id}
                id={`palette-option-${command.id}`}
                role="option"
                aria-selected={index === clampedIndex}
                className={`palette-item${index === clampedIndex ? " active" : ""}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => runCommand(command)}
              >
                {command.label}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
