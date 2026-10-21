import { useState } from "react";
import { ArrowRight, Lightbulb, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Sheet } from "./ui";
import { guideFor } from "@/lib/crm/guide";
import { plainModule, statusGuide } from "@/lib/crm/language";
import type { Module } from "@/lib/crm/catalog";

/* ==========================================================================
   The "?" panel.

   Opens on the page you are looking at and explains it in three short
   lines: what it is for, how to use it, and what to do next. No manual,
   no documentation site, no jargon.
   ========================================================================== */

export function HelpPanel({
  module,
  open,
  onClose,
  onStart,
}: {
  module?: Module | null;
  open: boolean;
  onClose: () => void;
  /** Called when the user asks to create their first record. */
  onStart?: () => void;
}) {
  const [statusHovered, setStatusHovered] = useState<string | null>(null);
  const guide = module ? guideFor(module) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={module ? `How ${plainModule(module)} works` : "How this works"}
      description={
        module ? "Three lines, and you are sorted." : "Everything you need, without a manual."
      }
      width={460}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-full border border-line-2 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-well"
        >
          Got it
        </button>
      }
    >
      {module && guide ? (
        <div className="space-y-5">
          <section>
            <h4 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
              <Lightbulb className="size-3.5" /> What this page is for
            </h4>
            <p className="mt-2 text-[14px] leading-relaxed text-foreground">{guide.purpose}</p>
          </section>

          <section>
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              How to use it
            </h4>
            <ol className="mt-2 space-y-2.5">
              {guide.empty.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-pine text-[10.5px] font-bold text-on-pine">
                    {i + 1}
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              Where to go next
            </h4>
            <div className="mt-2 space-y-1.5">
              {[
                { to: "/workspace/$module", params: { module: "leads" }, label: "Enquiries" },
                { to: "/workspace/$module", params: { module: "bookings" }, label: "Trips" },
                { to: "/workspace/$module", params: { module: "finance" }, label: "Money" },
                { to: "/tasks", params: undefined, label: "Tasks" },
              ].map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  params={link.params as never}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-xl border border-line bg-glass-2 px-3.5 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-glass-3"
                >
                  {link.label}
                  <ArrowRight className="size-4 text-muted" />
                </Link>
              ))}
            </div>
          </section>

          {onStart && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStart();
              }}
              className="h-11 w-full rounded-full bg-ink text-[13.5px] font-semibold text-on-ink transition-opacity hover:opacity-90"
            >
              Add your first {plainModule(module).toLowerCase().replace(/s$/, "")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <section>
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              The short version
            </h4>
            <ul className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-foreground">
              <li>· Every morning, the home page lists what needs you, in order.</li>
              <li>· Each item takes you straight to the record behind it.</li>
              <li>· Press / to find anything, or n to add something new.</li>
            </ul>
          </section>
          <section>
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              Keyboard
            </h4>
            <div className="mt-2 space-y-1.5">
              {[
                [["⌘K", "Ctrl K"], "Find anything"],
                [["/"], "Find anything"],
                [["n"], "Add something new"],
                [["g", "l"], "Go to enquiries"],
                [["g", "b"], "Go to trips"],
                [["g", "F"], "Go to money"],
                [["?"], "Open this panel"],
              ].map(([keys, description]) => (
                <div
                  key={description as string}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-glass-2 px-3.5 py-2.5"
                >
                  <span className="text-[12.5px] text-muted">{description}</span>
                  <span className="flex shrink-0 gap-1">
                    {(keys as string[]).map((k) => (
                      <kbd
                        key={k}
                        className="rounded-[5px] border border-line-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}

/** A tooltip that explains what a status means and what to do next. */
export function StatusHint({ status }: { status: string }) {
  const guide = statusGuide(status);
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-2xl bg-float p-3 text-left opacity-0 shadow-pop transition-opacity group-hover:opacity-100"
      role="tooltip"
    >
      <span className="block text-[12.5px] font-semibold text-foreground">{status}</span>
      <span className="mt-1 block text-[12px] leading-relaxed text-muted">{guide.meaning}</span>
      <span className="mt-1.5 block text-[12px] leading-relaxed text-foreground">
        <b>Next:</b> {guide.next}
      </span>
    </span>
  );
}

export { X };
