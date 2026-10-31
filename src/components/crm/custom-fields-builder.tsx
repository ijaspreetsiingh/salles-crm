import { useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, Move, Settings, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type CustomField } from "@/lib/crm/catalog";

export type FieldType = "text" | "number" | "date" | "select" | "email" | "tel" | "textarea";

export type CustomFieldDef = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[]; // for select
  group: string;
  hidden: boolean;
};

/** Custom Fields Builder — lets users add/remove/edit fields per module. */
export function CustomFieldsBuilder({
  moduleId,
  existingFields,
  onSave,
}: {
  moduleId: string;
  existingFields: CustomFieldDef[];
  onSave: (fields: CustomFieldDef[]) => void;
}) {
  const [fields, setFields] = useState<CustomFieldDef[]>(existingFields);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newField, setNewField] = useState<Partial<CustomFieldDef>>({
    label: "",
    type: "text",
    required: false,
    options: [],
    group: "General",
    hidden: false,
  });

  const addField = () => {
    if (!newField.label) {
      toast.error("Field label is required");
      return;
    }
    const next: CustomFieldDef = {
      id: `${moduleId}-${Date.now()}`,
      label: newField.label ?? "",
      type: newField.type ?? "text",
      required: newField.required ?? false,
      options: newField.options ?? [],
      group: newField.group ?? "General",
      hidden: false,
    };
    setFields([...fields, next]);
    setNewField({
      label: "",
      type: "text",
      required: false,
      options: [],
      group: "General",
      hidden: false,
    });
    setOpen(false);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
    toast.success("Field removed");
  };

  const editField = (field: CustomFieldDef) => {
    setEditingId(field.id);
    setNewField({
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options,
      group: field.group,
      hidden: field.hidden,
    });
    setOpen(true);
  };

  const updateField = () => {
    if (!editingId || !newField.label) return;
    setFields(
      fields.map((f) =>
        f.id === editingId
          ? {
              ...f,
              label: newField.label!,
              type: newField.type!,
              required: newField.required!,
              options: newField.options!,
              group: newField.group!,
              hidden: newField.hidden!,
            }
          : f,
      ),
    );
    setEditingId(null);
    setOpen(false);
    toast.success("Field updated");
  };

  const save = () => {
    onSave(fields);
    toast.success(`${fields.length} custom fields saved for ${moduleId}`);
  };

  const typeOptions: { value: FieldType; label: string }[] = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "select", label: "Dropdown (Select)" },
    { value: "email", label: "Email" },
    { value: "tel", label: "Phone" },
    { value: "textarea", label: "Text Area" },
  ];

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Custom Fields</h2>
          <Button
            onClick={() => {
              setNewField({
                label: "",
                type: "text",
                required: false,
                options: [],
                group: "General",
                hidden: false,
              });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Field
          </Button>
        </div>

        <p className="text-sm text-muted">
          Add custom fields to capture travel-specific information (passport number, visa type,
          preferred airline, etc.). These appear on record forms and detail views.
        </p>

        <div className="space-y-2">
          {fields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-well p-8 text-center">
              <FileText className="size-12 mx-auto text-muted mb-2" />
              <p className="text-sm text-muted">No custom fields yet. Add your first field.</p>
            </div>
          ) : (
            fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 hover:bg-glass-2 transition-colors"
              >
                <Move className="size-4 text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {field.label}
                    </span>
                    {field.required && (
                      <span className="text-[10px] bg-tomato/10 text-tomato px-2 py-0.5 rounded">
                        Required
                      </span>
                    )}
                    {field.hidden && (
                      <span className="text-[10px] bg-line text-faint px-2 py-0.5 rounded">
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{field.type}</span>
                    <span>•</span>
                    <span>{field.group}</span>
                    {field.options.length > 0 && <span>({field.options.length} options)</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editField(field)}
                    title="Edit field"
                  >
                    <Settings className="size-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => removeField(field.id)}
                    title="Delete field"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button variant="outline" onClick={save}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* Add/Edit field dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Field" : "Add Custom Field"}</DialogTitle>
            <DialogDescription>Define a new custom field for {moduleId} records.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editingId) updateField();
              else addField();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Field Label</Label>
                <Input
                  value={newField.label ?? ""}
                  onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  placeholder="e.g. Passport Number"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={newField.type ?? "text"}
                  onValueChange={(v) => setNewField({ ...newField, type: v as FieldType })}
                >
                  {typeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Group / Section</Label>
                <Input
                  value={newField.group ?? "General"}
                  onChange={(e) => setNewField({ ...newField, group: e.target.value })}
                  placeholder="e.g. Travel Details"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="required"
                    type="checkbox"
                    checked={newField.required ?? false}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                  />
                  <Label htmlFor="required" className="text-sm font-medium cursor-pointer">
                    Required field
                  </Label>
                </div>
              </div>
            </div>

            {newField.type === "select" && (
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input
                  value={newField.options?.join(", ") ?? ""}
                  onChange={(e) =>
                    setNewField({
                      ...newField,
                      options: e.target.value
                        .split(",")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="e.g. Tourist, Business, Transit"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? "Update Field" : "Add Field"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
