import type { Key, ReactNode } from "react";

export type SurfaceStat = {
  label: string;
  value: ReactNode;
};

type WorkspaceSurfaceProps = {
  variant?: "chat" | "decision" | "mission";
  children: ReactNode;
};

type BrandCardProps = {
  eyebrow: string;
  title: string;
  description: string;
};

type PanelCardProps = {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
};

type StageHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  meta: ReactNode;
};

type RailButtonProps = {
  active?: boolean;
  key?: Key;
  title: ReactNode;
  detail: ReactNode;
  onClick: () => void;
};

type StatusLineProps = {
  phase: string;
  message: string;
};

export function WorkspaceSurface({ variant = "chat", children }: WorkspaceSurfaceProps) {
  const variantClassName = variant === "chat" ? "" : `aui-${variant}-shell`;
  return <main className={`aui-shell aui-work-surface ${variantClassName}`.trim()}>{children}</main>;
}

export function BrandCard({ eyebrow, title, description }: BrandCardProps) {
  return (
    <div className="aui-brand-card">
      <span className="aui-kicker">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function StatGrid({ stats }: { stats: readonly SurfaceStat[] }) {
  return (
    <div className="aui-stat-grid">
      {stats.map((stat) => (
        <article className="aui-stat-card" key={stat.label}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </article>
      ))}
    </div>
  );
}

export function PanelCard({ eyebrow, title, children }: PanelCardProps) {
  return (
    <section className="aui-panel-card">
      <div className="aui-panel-heading">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      {children}
    </section>
  );
}

export function StageHeader({ eyebrow, title, meta }: StageHeaderProps) {
  return (
    <header className="aui-topbar">
      <div>
        <span className="aui-kicker">{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      <div className="aui-topbar-actions">
        <span className="aui-status-dot" />
        <span className="aui-topbar-meta">{meta}</span>
      </div>
    </header>
  );
}

export function RailButton({ active = false, title, detail, onClick }: RailButtonProps) {
  return (
    <button className={`aui-project-item ${active ? "active" : ""}`} onClick={onClick} type="button">
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
}

export function StatusLine({ phase, message }: StatusLineProps) {
  return <p className={`aui-status-line ${phase}`}>{message}</p>;
}
