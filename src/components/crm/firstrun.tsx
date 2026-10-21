import { useMemo, useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Btn, Sheet } from "./ui";
import { findModule, type Module, type RecordRow } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { getSchema } from "@/lib/crm/schema";
import { plainModule } from "@/lib/crm/language";

/* ==========================================================================
   The guided first record.

   An empty table teaches nothing. Instead, when someone opens a workspace
   with nothing in it, the app sits them down and walks them through making
   their very first record — one question at a time, in plain words, with a
   live preview of what they are building.

   It is the difference between "fill in this form" and "here is what to do
   next, and here is what it will look like".
   ========================================================================== */

type Step = {
  /** The question, in one short sentence. */
  question: string;
  /** A line under the question that says why it matters. */
  because: string;
  /** The field key this step fills. */
  key: string;
  /** The label shown above the input. */
  label: string;
  type: "text" | "date" | "number" | "select";
  placeholder?: string | undefined;
  options?: string[] | undefined;
};

/** The questions we ask, per module. Falls back to the schema fields. */
function stepsFor(module: Module): Step[] {
  const schema = getSchema(module.id);
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));

  const named = (
    key: string,
    question: string,
    because: string,
    type: Step["type"] = "text",
  ): Step => ({
    question,
    because,
    key,
    label: byKey.get(key)?.label ?? key,
    type,
    placeholder: byKey.get(key)?.placeholder,
    options:
      type === "select"
        ? Array.isArray(byKey.get(key)?.options)
          ? (byKey.get(key)!.options as string[])
          : schema.statuses
        : undefined,
  });

  const switcher: Record<string, Step[]> = {
    leads: [
      named("name", "Who is travelling?", "Their name, so you know who you are talking to."),
      named("destination", "Where do they want to go?", "The place they are asking about."),
      named("email", "How can you reach them?", "An email address, so replies go to them."),
      named("phone", "And a phone number?", "Most travellers prefer a call for a first enquiry."),
    ],
    bookings: [
      named("name", "Who is travelling?", "The traveller's name."),
      named("destination", "Where are they going?", "The destination of this trip."),
      named("date", "When do they travel?", "The departure date."),
      named("amount", "What is the trip worth?", "The total the customer will pay."),
    ],
    quotations: [
      named("name", "What are you quoting?", "A name for the proposal, e.g. 'Bali — 6 nights'."),
      named("destination", "Where is the trip?", "The destination."),
      named("amount", "What will it cost them?", "The price you are quoting."),
    ],
    customers: [
      named("name", "What is their name?", "The traveller's name."),
      named("email", "Their email address?", "So you can send them details."),
      named("phone", "And their phone number?", "Optional, but useful."),
    ],
    visa: [
      named("name", "Who is applying?", "The applicant's name."),
      named("destination", "Which country are they going to?", "The visa destination."),
      named("date", "When do they travel?", "The departure date."),
    ],
    support: [
      named("name", "Who is the problem about?", "The customer's name."),
      named("detail", "What is the problem?", "A short description of what went wrong."),
    ],
    finance: [
      named("name", "Who is being billed?", "The customer's name."),
      named("amount", "How much?", "The invoice amount."),
      named("date", "When is it due?", "The due date."),
    ],
  };

  const custom = switcher[module.id];
  if (custom) return custom;

  // Generic: the first few fields of the module, phrased as questions.
  return schema.fields
    .filter((f) => f.group === schema.sections[0])
    .slice(0, 3)
    .map((f) => ({
      question: f.label.endsWith("?") ? f.label : `What is the ${f.label.toLowerCase()}?`,
      because: f.hint ?? "You can change this later.",
      key: f.key,
      label: f.label,
      type:
        f.type === "number"
          ? "number"
          : f.type === "date"
            ? "date"
            : f.type === "select"
              ? "select"
              : "text",
      placeholder: f.placeholder,
      options: Array.isArray(f.options) ? f.options : undefined,
    }));
}

export function FirstRunWizard({
  module,
  open,
  onClose,
  onCreated,
}: {
  module: Module;
  open: boolean;
  onClose: () => void;
  onCreated?: (row: RecordRow) => void;
}) {
  const { save, settings } = useCRM();
  const steps = useMemo(() => stepsFor(module), [module]);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const step = steps[index];
  const value = step ? (values[step.key] ?? "") : "";
  const isLast = index === steps.length - 1;

  const preview = useMemo(() => {
    const parts = steps
      .map((s) => values[s.key])
      .filter((v) => v && v.trim())
      .slice(0, 3);
    return parts.length ? parts.join(" · ") : "Your new record will look like this";
  }, [steps, values]);

  const canContinue = Boolean(value.trim());

  const save_ = async () => {
    if (!step) return;
    setSaving(true);
    try {
      const schema = getSchema(module.id);
      const row: RecordRow = {
        id: `${module.id.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        name: values["name"]?.trim() || values[steps[0]?.key ?? "name"]?.trim() || "New record",
        detail: values["detail"]?.trim() ?? "",
        destination: values["destination"]?.trim() ?? "",
        owner: settings.employees[0]?.name ?? "",
        branch: settings.branches[0] ?? "",
        date: values["date"]?.trim() || new Date().toISOString().slice(0, 10),
        amount: Number(values["amount"] ?? 0) || 0,
        status: schema.statuses[0] ?? "Pending",
        email: values["email"]?.trim() ?? "",
        phone: values["phone"]?.trim() ?? "",
        source: values["source"]?.trim() ?? "Website",
        notes: "",
        extra: {},
      };
      save(module.id, row);
      toast.success(`${plainModule(module.id)} added — nice one`);
      onCreated?.(row);
      onClose();
      setValues({});
      setIndex(0);
    } finally {
      setSaving(false);
    }
  };

  if (!step) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Let's add your first ${plainModule(module.id).toLowerCase().replace(/s$/, "")}`}
      description="Three quick questions. You can change anything later."
      width={520}
      footer={
        <>
          <Btn
            tone="ghost"
            onClick={() => {
              if (index === 0) onClose();
              else setIndex((i) => i - 1);
            }}
          >
            {index === 0 ? "Cancel" : "Back"}
          </Btn>
          <Btn
            tone="primary"
            loading={saving}
            disabled={!canContinue}
            onClick={() => {
              if (isLast) void save_();
              else setIndex((i) => i + 1);
            }}
            trailing={isLast ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
          >
            {isLast ? "Create it" : "Next"}
          </Btn>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= index ? "bg-pine" : "bg-well"
            }`}
            aria-hidden
          />
        ))}
        <span className="ml-1 text-[11.5px] font-semibold text-muted tabular-nums">
          {index + 1} of {steps.length}
        </span>
      </div>

      <div className="mb-5 flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-butter/25 text-foreground">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h3 className="text-[19px] font-semibold leading-tight tracking-tight text-foreground">
            {step.question}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.because}</p>
        </div>
      </div>

      {step.type === "select" ? (
        <div className="flex flex-wrap gap-2">
          {(step.options ?? []).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setValues((v) => ({ ...v, [step.key]: option }))}
              className={`h-10 rounded-full px-4 text-[13px] font-semibold transition-all ${
                value === option ? "bg-ink text-on-ink" : "bg-well text-muted hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <input
          autoFocus
          type={step.type === "number" ? "number" : step.type === "date" ? "date" : "text"}
          value={value}
          placeholder={step.placeholder ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [step.key]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canContinue) {
              if (isLast) void save_();
              else setIndex((i) => i + 1);
            }
          }}
          className="h-12 w-full rounded-2xl border border-line-2 bg-glass-3 px-4 text-[15px] text-foreground outline-none transition-colors placeholder:text-faint focus:border-pine focus:bg-solid"
        />
      )}

      <div className="mt-6 rounded-2xl border border-line bg-well p-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Preview</p>
        <p className="mt-1.5 text-[13.5px] font-semibold text-foreground">
          {values["name"]?.trim() || "Your new record"}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">{preview}</p>
      </div>
    </Sheet>
  );
}

export { findModule };
