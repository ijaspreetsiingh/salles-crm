import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatTile, type Tone } from "./ui";

/* ==========================================================================
   The page template.

   Every screen in Traveldesk uses the same six zones, in the same order:

     1 IDENTITY     what is this page, and what is it for
     2 SWITCHBOARD  the views, filters and search that shape the work
     3 WORK         the main view (board, ledger, calendar, canvas…)
     4 CONTEXT      supporting detail next to the work
     5 NEXT         what still needs the user
     6 FOOTER       counts, pagination, keyboard hints

   A user only has to learn this shape once. Every module then feels
   familiar on first sight.
   ========================================================================== */

export type PageStat = {
  icon?: ReactNode | undefined;
  value: ReactNode;
  label: string;
  delta?: { text: string; dir: "up" | "down" } | undefined;
  tone?: Tone | "neutral" | undefined;
  /** Clicking a stat drills into the filtered list that produced it. */
  href?: string | undefined;
  onClick?: (() => void) | undefined;
};

export function PageIdentity({
  eyebrow,
  title,
  purpose,
  stats,
  actions,
}: {
  eyebrow?: string | undefined;
  title: ReactNode;
  /** One plain-language sentence: what this page is for. Never generic. */
  purpose: string;
  stats?: PageStat[] | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <>
      <header className="zone-identity">
        <div className="zone-identity__text">
          {eyebrow && <div className="zone-identity__eyebrow">{eyebrow}</div>}
          <h1 className="zone-identity__title">{title}</h1>
          <p className="zone-identity__purpose">{purpose}</p>
        </div>
        {actions && <div className="zone-identity__actions">{actions}</div>}
      </header>
      {stats && stats.length > 0 && (
        <div className="zone-stats">
          {stats.map((stat, i) => (
            <StatTile
              key={i}
              icon={stat.icon}
              value={stat.value}
              label={stat.label}
              delta={stat.delta}
              tone={stat.tone}
              href={stat.href}
              onClick={stat.onClick}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function Switchboard({ children }: { children: ReactNode }) {
  return (
    <div className="switchboard" role="search" aria-label="View options">
      {children}
    </div>
  );
}

export function WorkZone({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0", className)}>{children}</div>;
}

export function ContextZone({ children }: { children: ReactNode }) {
  return <div className="mt-5">{children}</div>;
}

export function NextZone({
  title = "Needs you",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="zone-identity__eyebrow">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function PageFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[11.5px] text-faint">
      {children}
    </footer>
  );
}

/**
 * Full page scaffold. `identity` and `work` are required; the rest is
 * optional so simple pages can stay short without losing the shape.
 */
export function Page({
  identity,
  switchboard,
  work,
  context,
  next,
  footer,
}: {
  identity: ReactNode;
  switchboard?: ReactNode;
  work: ReactNode;
  context?: ReactNode;
  next?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="page">
      {identity}
      {switchboard && <Switchboard>{switchboard}</Switchboard>}
      <WorkZone>{work}</WorkZone>
      {context && <ContextZone>{context}</ContextZone>}
      {next && <NextZone>{next}</NextZone>}
      {footer && <PageFooter>{footer}</PageFooter>}
    </div>
  );
}
