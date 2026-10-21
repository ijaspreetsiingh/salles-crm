import { useState, type ReactNode } from "react";
import { Search, Plus, Download, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PrimaryBtn, IconBtn } from "./ui";

export function SearchField({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3.5"><Search className="size-4 shrink-0 text-muted-foreground" /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="w-full min-w-0 bg-transparent text-sm outline-none" /></label>;
}

export function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return <label className="relative inline-flex h-10 items-center rounded-full border border-border bg-card"><select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className="h-full max-w-48 appearance-none rounded-full bg-transparent pl-4 pr-9 text-sm outline-none">{options.map(o => <option key={o}>{o}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 size-3.5" /></label>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2.5">{children}</div>;
}

export function ExportButton({ rows, name }: { rows: Record<string, unknown>[]; name: string }) {
  const download = () => {
    const keys = Object.keys(rows[0] ?? {});
    const csv = [keys.join(","), ...rows.map(row => keys.map(k => JSON.stringify(String(row[k] ?? ""))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <IconBtn label="Export CSV" onClick={download}><Download className="size-4" /></IconBtn>;
}

export type EntryField = { name: string; label: string; type?: string; options?: string[] };
export function AddEntry({ title, label, fields, onSave }: { title: string; label: string; fields: EntryField[]; onSave: (values: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  return <><PrimaryBtn onClick={() => setOpen(true)}><Plus className="size-4" />{label}</PrimaryBtn><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">{title} details</DialogDescription><form className="grid gap-4" onSubmit={e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>; onSave(values); setOpen(false); }}>{fields.map(f => <label key={f.name} className="grid gap-1.5 text-sm">{f.label}{f.options ? <select name={f.name} className="h-10 rounded-lg border bg-card px-3">{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input required name={f.name} type={f.type ?? "text"} min={f.type === "number" ? 0 : undefined} className="h-10 rounded-lg border bg-card px-3 outline-none focus:ring-2 focus:ring-ring" />}</label>)}<PrimaryBtn type="submit" className="justify-center">Save</PrimaryBtn></form></DialogContent></Dialog></>;
}

export function Details({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}><DialogContent><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">Record details</DialogDescription>{children}</DialogContent></Dialog>;
}

export function EmptyResults() { return <p className="py-12 text-center text-sm text-muted-foreground">No matching records</p>; }