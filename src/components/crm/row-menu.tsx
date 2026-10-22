import { useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Pencil,
  ScrollText,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { IconBtn } from "./ui";
import { getSchema } from "@/lib/crm/schema";
import type { Module, RecordRow } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { createPaymentLink, downloadInvoicePdf } from "@/lib/api/modules";
import { errorMessage } from "@/lib/api/client";

/**
 * The row "···" menu — real actions, not just an open button:
 * view, edit, duplicate, change stage, assign to me, quick invoice actions
 * and delete (with confirm).
 */
export function RowMenu({
  module,
  row,
  onOpen,
  onEdit,
}: {
  module: Module;
  row: RecordRow;
  onOpen: (row: RecordRow) => void;
  onEdit: (row: RecordRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { save, update, remove, user } = useCRM();
  const schema = getSchema(module.id);
  const statusOptions = schema.boardStatuses ?? module.tabs.filter((t) => t !== "All");
  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
  };

  return (
    <div className="relative">
      <IconBtn
        label={`${module.noun} actions for ${row.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="size-7"
      >
        <MoreHorizontal className="size-4" />
      </IconBtn>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          />
          <div
            className="filter__menu right-2 z-50"
            style={{ top: "1.75rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="filter__label">{row.id} · {row.name || "—"}</div>
            <button
              type="button"
              className="filter__option"
              onClick={() => {
                onOpen(row);
                close();
              }}
            >
              <ScrollText className="size-3.5" /> Open side panel
            </button>
            <button
              type="button"
              className="filter__option"
              onClick={() => {
                onEdit(row);
                close();
              }}
            >
              <Pencil className="size-3.5" /> Edit details
            </button>
            <button
              type="button"
              className="filter__option"
              onClick={() => {
                const copy: RecordRow = { ...row };
                delete (copy as { id?: string }).id;
                copy.id = `${recordPrefix(module)}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
                copy.name = `${row.name} (copy)`;
                save(module.id, copy);
                toast.success("Copy created");
                close();
              }}
            >
              <Copy className="size-3.5" /> Duplicate
            </button>

            {statusOptions.length > 0 && (
              <>
                <div className="filter__label" style={{ marginTop: 4 }}>Set stage</div>
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {statusOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        update(module.id, { ...row, status: s });
                        toast.success(`${row.id} → ${s}`);
                        close();
                      }}
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                        (row.status === s
                          ? "border-ink bg-ink text-on-ink"
                          : "border-line hover:bg-well")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              className="filter__option"
              onClick={() => {
                const me = user?.name ?? "Me";
                update(module.id, { ...row, owner: me });
                toast.success(`Assigned to ${me}`);
                close();
              }}
            >
              <UserCheck className="size-3.5" /> Assign to me
            </button>

            {module.id === "finance" && (
              <>
                <button
                  type="button"
                  className="filter__option"
                  onClick={async () => {
                    close();
                    try {
                      await downloadInvoicePdf(row.id);
                      toast.success("Invoice PDF downloaded");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Download className="size-3.5" /> Download invoice PDF
                </button>
                <button
                  type="button"
                  className="filter__option"
                  onClick={async () => {
                    close();
                    try {
                      const link = await createPaymentLink(row.id, {
                        customerName: row.name,
                        customerEmail: row.email || undefined,
                        customerPhone: row.phone || undefined,
                      });
                      if (link.configured && link.checkoutUrl) {
                        await navigator.clipboard?.writeText(link.checkoutUrl).catch(() => undefined);
                        toast.success("Razorpay payment link copied");
                      } else {
                        toast.info("Payment link recorded — add Razorpay keys on the server to charge.");
                      }
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <ExternalLink className="size-3.5" /> Create payment link
                </button>
                {row.email && (
                  <a
                    href={`mailto:${row.email}?subject=${encodeURIComponent(`Invoice ${row.id}`)}`}
                    className="filter__option"
                    onClick={close}
                  >
                    <Mail className="size-3.5" /> Email customer
                  </a>
                )}
              </>
            )}

            {confirmDelete ? (
              <button
                type="button"
                className="filter__option text-tomato"
                onClick={async () => {
                  close();
                  await remove(module.id, row.id);
                  toast.success(`${row.id} deleted`);
                }}
              >
                <Trash2 className="size-3.5" /> Yes, delete {row.id}
              </button>
            ) : (
              <button
                type="button"
                className="filter__option"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" /> Delete…
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function recordPrefix(module: Module) {
  const prefixes: Record<string, string> = {
    leads: "ENQ",
    customers: "CUS",
    quotations: "QUO",
    bookings: "BKG",
    finance: "INV",
    suppliers: "SUP",
    transfers: "TRF",
    companies: "COR",
    visa: "VIS",
    tasks: "TSK",
    support: "TKT",
    inventory: "INV",
  };
  return (prefixes[module.id] ?? module.id.slice(0, 3)).toUpperCase();
}
