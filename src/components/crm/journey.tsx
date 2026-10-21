import { Link } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import type { JourneyStep } from "@/lib/crm/journey";

/* ==========================================================================
   The journey rail.

   A horizontal chain of steps. Filled steps are real records you can open;
   empty steps show what is still missing, with an "add" shortcut.
   ========================================================================== */

export function JourneyRail({
  steps,
  onAdd,
}: {
  steps: JourneyStep[];
  /** Called with the step id when the user wants to create the missing record. */
  onAdd?: (step: JourneyStep) => void;
}) {
  const firstOpen = steps.findIndex((s) => !s.record);
  const currentIndex = firstOpen === -1 ? steps.length - 1 : firstOpen;

  return (
    <nav className="journey" aria-label="Journey">
      {steps.map((step, i) => {
        const done = Boolean(step.record);
        const current = i === currentIndex;
        const body = (
          <>
            <span className="journey__line" />
            <span
              className={`journey__dot ${done ? "is-done" : ""} ${current ? "is-current" : ""}`}
            >
              {done ? <Check className="size-3.5" /> : <Plus className="size-3" />}
            </span>
            <span className="journey__label">{step.label}</span>
            <span className="journey__meta">
              {step.record ? step.record.id : (step.missing ?? "Not started")}
              {step.detail ? ` · ${step.detail}` : ""}
            </span>
          </>
        );

        if (step.record) {
          return (
            <Link
              key={step.id}
              to="/workspace/$module"
              params={{ module: step.moduleId || "bookings" }}
              className={`journey__step ${done ? "is-done" : ""} ${current ? "is-current" : ""}`}
              title={`${step.label}: ${step.record.name}`}
            >
              {body}
            </Link>
          );
        }

        return (
          <button
            key={step.id}
            type="button"
            className={`journey__step ${current ? "is-current" : ""}`}
            onClick={() => onAdd?.(step)}
            title={step.missing ?? `Add ${step.label}`}
            style={{ cursor: onAdd ? "pointer" : "default" }}
          >
            {body}
          </button>
        );
      })}
    </nav>
  );
}
