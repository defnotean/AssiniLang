import type { ReactNode } from "react";

export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-block">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
