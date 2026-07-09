import type { ReactNode } from "react";

export type DesktopActionButton = {
  busy?: boolean;
  disabled?: boolean;
  key: string;
  label: ReactNode;
  onClick: () => void;
};

export type DesktopActionGroup = {
  buttons: DesktopActionButton[];
  id: string;
  label: ReactNode;
};

type DesktopActionGroupsProps = {
  ariaLabel: string;
  groups: DesktopActionGroup[];
};

export function DesktopActionGroups({ ariaLabel, groups }: DesktopActionGroupsProps) {
  return (
    <div className="desktop-action-groups" role="group" aria-label={ariaLabel}>
      {groups.map((group) => {
        const labelId = `desktop-action-group-${group.id}-label`;
        return (
          <div
            key={group.id}
            className="desktop-action-group"
            data-desktop-action-group={group.id}
            role="group"
            aria-labelledby={labelId}
          >
            <span id={labelId} className="detail-label">{group.label}</span>
            <div className="settings-actions desktop-actions">
              {group.buttons.map((button) => (
                <button
                  key={button.key}
                  type="button"
                  className="secondary"
                  disabled={button.disabled}
                  aria-busy={button.busy || undefined}
                  onClick={button.onClick}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
