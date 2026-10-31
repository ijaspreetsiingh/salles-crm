import { useRef, useState } from "react";
import { ArrowDownToLine, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Btn, Sheet } from "./ui";
import { errorMessage } from "@/lib/api/client";
import { importRecordsCsv, type ImportResultDto } from "@/lib/api/crm";
import { plainModule } from "@/lib/crm/language";
import type { Module } from "@/lib/crm/catalog";

/* ==========================================================================
   Import a spreadsheet.

   The first week of a new CRM is the week people give up, because three years
   of enquiries live in a CSV. This takes that file, shows exactly what it
   understood, and reports every row it could not use in the same plain
   language as the rest of the app.
   ========================================================================== */

/** A file with the expected headings, filled in with one example row. */
const templateCsv = () =>
  [
    "Name,Email,Phone,Destination,Date,Value,Status,Owner,Branch,Source,Notes",
    "Priya Mehta,priya@example.com,+91 98200 11223,Bali,2026-11-14,92000,New,,,Import,From the old system",
  ].join("\n");

export function ImportSheet({
  module,
  open,
  onClose,
  onDone,
}: {
  module: Module;
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the list can be re-read. */
  onDone: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(null);
    setCsv("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("That file is larger than 2 MB — split it and import a part at a time.");
      return;
    }
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
      setResult(null);
    } catch {
      toast.error("Could not read that file. Try saving it as CSV from your spreadsheet.");
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${module.id}-import-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    if (!csv) return;
    setBusy(true);
    try {
      const summary = await importRecordsCsv(module.id, csv);
      setResult(summary);
      if (summary.created > 0) {
        toast.success(
          `${summary.created} ${module.noun}${summary.created === 1 ? "" : "s"} imported`,
        );
        onDone();
      } else {
        toast.error("Nothing could be imported — check the notes below.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not import that file"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={`Import into ${plainModule(module)}`}
      description="Bring in a CSV from your old system. Owners and branches are matched to your team by name."
      width={520}
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-glass-2 px-3 py-3">
            <p className="text-[13px] font-semibold text-foreground">
              {result.created} {module.noun}
              {result.created === 1 ? "" : "s"} imported
              {result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}
            </p>
            {result.sample.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11.5px] text-muted">
                {result.sample.map((row) => (
                  <li key={row.reference}>
                    {row.reference} · {row.name}
                  </li>
                ))}
                {result.created > result.sample.length && (
                  <li>…and {result.created - result.sample.length} more</li>
                )}
              </ul>
            )}
          </div>

          {result.issues.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-well px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                What needs a look
              </p>
              {result.issues.map((issue) => (
                <p key={`${issue.row}-${issue.message}`} className="text-[11.5px] text-muted">
                  <b className="font-semibold text-foreground">Row {issue.row}</b> — {issue.message}
                </p>
              ))}
            </div>
          )}

          <div className="dialog-actions">
            <Btn type="button" onClick={reset}>
              Import another file
            </Btn>
            <Btn type="button" tone="primary" onClick={close}>
              Done
            </Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 bg-glass-2 px-4 py-8 text-center transition-colors hover:bg-glass-3"
          >
            <FileUp className="size-6 text-muted" />
            <span className="text-[13px] font-semibold text-foreground">
              {fileName ?? "Choose a CSV file"}
            </span>
            <span className="text-[11.5px] text-muted">
              {fileName
                ? "Ready when you are — nothing is saved until you press import."
                : "Exported from Excel or Google Sheets. First row must be headings."}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="CSV file to import"
            onChange={(event) => void pick(event.target.files?.[0])}
          />

          <ul className="space-y-1.5 rounded-xl bg-well px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            <li>
              <b className="font-semibold text-foreground">Name</b> is the only heading required.
              Everything else is optional.
            </li>
            <li>
              Recognised headings: Name, Email, Phone, Destination, Date, Value, Status, Owner,
              Branch, Source, Notes, Reference.
            </li>
            <li>Other columns are kept with the record, so nothing from your sheet is lost.</li>
            <li>Up to 1,000 rows at a time. Duplicate references are skipped, not doubled.</li>
          </ul>

          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground underline-offset-2 hover:underline"
          >
            <ArrowDownToLine className="size-3.5" /> Download a template with the right headings
          </button>

          <div className="dialog-actions">
            <Btn type="button" onClick={close}>
              Cancel
            </Btn>
            <Btn
              type="button"
              tone="primary"
              icon={<Upload />}
              loading={busy}
              disabled={!csv}
              onClick={() => void run()}
            >
              Import {fileName ? "this file" : ""}
            </Btn>
          </div>
        </div>
      )}
    </Sheet>
  );
}
