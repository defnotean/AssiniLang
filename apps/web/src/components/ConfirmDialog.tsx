import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useI18n } from "../i18n";

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(dialogRef);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("confirmDialog.aria")}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm"
            ref={confirmRef}
            onClick={onConfirm}
          >
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
