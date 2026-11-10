import { useState } from "react";
import { Download, ListChecks, Pencil, Trash2, UserPlus, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  addGroupMember,
  autoAssignRooms,
  deleteGroupMember,
  fetchGroupManifest,
  fetchGroupMembers,
  fetchRooming,
  importGroupMembers,
  updateGroupMember,
  type GroupMemberDto,
  type GroupSummary,
} from "@/lib/api/ops";

/* ==========================================================================
   Delegates — the traveller list behind a group trip.

   A group is not one record, it is one record plus forty passports. This
   panel is the only place in the app where those travellers are managed:
   add them one by one or paste the whole list, place them into rooms, and
   take away the two documents the hotel and the tour manager actually ask
   for — the rooming list and the manifest.
   ========================================================================== */

type Draft = {
  name: string;
  phone: string;
  passport: string;
  roomType: string;
  roomNumber: string;
  dietary: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  phone: "",
  passport: "",
  roomType: "Double",
  roomNumber: "",
  dietary: "",
};

const ROOM_TYPES = ["Single", "Double", "Twin", "Triple", "Child"];

/** Escapes one CSV cell and keeps Excel from eating names that start with =. */
const csvCell = (value: string | number | undefined): string => {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** Downloads rows as a CSV file — BOM included so Excel reads passports right. */
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const chip = (label: string, value: number, tone: "ink" | "warn") =>
  value > 0 || tone === "ink" ? (
    <span
      key={label}
      className={tone === "warn" ? "delegates__chip delegates__chip--warn" : "delegates__chip"}
    >
      <strong>{value}</strong> {label}
    </span>
  ) : null;

export function GroupDelegatesSection({ recordId }: { recordId: string }) {
  const { data, loading, error, reload } = useApiQuery(
    () => fetchGroupMembers(recordId),
    [recordId],
  );

  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pasteText, setPasteText] = useState("");
  const [pasteRoomType, setPasteRoomType] = useState("Double");

  const members: GroupMemberDto[] = data?.items ?? [];
  const summary: GroupSummary | undefined = data?.summary;

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const startEdit = (member: GroupMemberDto) => {
    setEditingId(member.id);
    setPasting(false);
    setAdding(true);
    setDraft({
      name: member.name,
      phone: member.phone,
      passport: member.passport,
      roomType: member.roomType,
      roomNumber: member.roomNumber,
      dietary: member.dietary,
    });
  };

  const resetForm = () => {
    setAdding(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const submitDraft = async () => {
    if (!draft.name.trim()) {
      toast.error("A delegate needs a name");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateGroupMember(editingId, draft);
        toast.success(`${draft.name} updated`);
      } else {
        await addGroupMember(recordId, draft);
        toast.success(`${draft.name} added to the trip`);
      }
      resetForm();
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the delegate"));
    } finally {
      setBusy(false);
    }
  };

  const submitPaste = async () => {
    if (!pasteText.trim()) {
      toast.error("Paste at least one traveller");
      return;
    }
    setBusy(true);
    try {
      const result = await importGroupMembers(recordId, pasteText, pasteRoomType);
      toast.success(`${result.added} delegates added`);
      setPasteText("");
      setPasting(false);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add the list"));
    } finally {
      setBusy(false);
    }
  };

  const assignRooms = async () => {
    setBusy(true);
    try {
      const result = await autoAssignRooms(recordId);
      toast.success(
        `${result.assigned} delegates placed into ${result.rooms} rooms — you can still move anyone`,
      );
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not assign rooms"));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member: GroupMemberDto) => {
    setBusy(true);
    try {
      await deleteGroupMember(member.id);
      toast.success(`${member.name} removed from the trip`);
      setConfirmingId(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the delegate"));
    } finally {
      setBusy(false);
    }
  };

  const downloadRooming = async () => {
    try {
      const data = await fetchRooming(recordId);
      const rows: Array<Array<string | number>> = [
        ["Room", "Room type", "Guest", "Passport", "Dietary", "Bed preference", "Age"],
        ...data.rooms.flatMap((room) =>
          room.guests.map((guest, index) => [
            index === 0 ? room.roomNumber || "Unassigned" : "",
            index === 0 ? room.roomType : "",
            guest.name,
            guest.passport,
            guest.dietary,
            guest.bedPreference,
            guest.age,
          ]),
        ),
        ...data.unassigned.map((name) => ["Unassigned", "", name, "", "", "", ""]),
      ];
      downloadCsv(`rooming-list-${data.group.reference || "group"}.csv`, rows);
      toast.success(
        data.unassigned.length
          ? `Rooming list downloaded — ${data.unassigned.length} still need a room`
          : "Rooming list downloaded",
      );
    } catch (err) {
      toast.error(errorMessage(err, "Could not build the rooming list"));
    }
  };

  const downloadManifest = async () => {
    try {
      const data = await fetchGroupManifest(recordId);
      const rows: Array<Array<string | number>> = [
        [
          "Name",
          "Passport",
          "Nationality",
          "Date of birth",
          "Phone",
          "Room",
          "Room type",
          "Status",
          "Dietary",
          "Emergency contact",
          "Notes",
        ],
        ...data.travellers.map((traveller) => [
          traveller.name,
          traveller.passport,
          traveller.nationality ?? "",
          traveller.dateOfBirth ?? "",
          traveller.phone,
          traveller.room,
          traveller.roomType,
          traveller.status,
          traveller.dietary,
          traveller.emergencyContact,
          traveller.notes ?? "",
        ]),
      ];
      const reference = data.group?.reference ?? data.departure?.reference ?? "group";
      downloadCsv(`manifest-${reference}.csv`, rows);
      toast.success("Manifest downloaded");
    } catch (err) {
      toast.error(errorMessage(err, "Could not build the manifest"));
    }
  };

  return (
    <section className="record-sheet__section">
      <h4>
        <Users size={14} /> Delegates
      </h4>

      {loading && !data && <p className="record-sheet__hint">Loading the traveller list…</p>}
      {error && <p className="record-sheet__hint">{error}</p>}

      {summary && (
        <div className="delegates__summary">
          {chip("delegates", summary.delegates, "ink")}
          {chip("confirmed", summary.confirmed, "ink")}
          {chip("rooms", summary.rooms, "ink")}
          {summary.unassigned > 0 && chip("without a room", summary.unassigned, "warn")}
          {summary.passportsMissing > 0 &&
            chip("without passports", summary.passportsMissing, "warn")}
        </div>
      )}

      <div className="record-sheet__actions">
        <button
          type="button"
          onClick={() => {
            if (adding && !editingId) resetForm();
            else {
              resetForm();
              setAdding(true);
            }
          }}
        >
          <UserPlus size={14} /> {editingId ? "Editing" : "Add delegate"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            setPasting((open) => !open);
          }}
        >
          <ListChecks size={14} /> Paste a list
        </button>
        <button type="button" onClick={() => void assignRooms()} disabled={busy}>
          <Wand2 size={14} /> Assign rooms
        </button>
        <button type="button" onClick={() => void downloadRooming()}>
          <Download size={14} /> Rooming list
        </button>
        <button type="button" onClick={() => void downloadManifest()}>
          <Download size={14} /> Manifest
        </button>
      </div>

      {adding && (
        <div className="delegates__form">
          <div className="record-sheet__field-row">
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Name (as on the passport)</span>
              <input
                value={draft.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Priya Mehta"
              />
            </label>
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Phone</span>
              <input
                value={draft.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="+91 98…"
              />
            </label>
          </div>
          <div className="record-sheet__field-row">
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Passport number</span>
              <input
                value={draft.passport}
                onChange={(e) => set("passport")(e.target.value)}
                placeholder="Leave blank if not decided yet"
              />
            </label>
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Room type</span>
              <select value={draft.roomType} onChange={(e) => set("roomType")(e.target.value)}>
                {ROOM_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="record-sheet__field-row">
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Room number</span>
              <input
                value={draft.roomNumber}
                onChange={(e) => set("roomNumber")(e.target.value)}
                placeholder="Fill later with Assign rooms"
              />
            </label>
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Dietary needs</span>
              <input
                value={draft.dietary}
                onChange={(e) => set("dietary")(e.target.value)}
                placeholder="Jain, no nuts…"
              />
            </label>
          </div>
          <div className="record-sheet__actions">
            <button type="button" onClick={() => void submitDraft()} disabled={busy}>
              {editingId ? "Save changes" : "Add to trip"}
            </button>
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {pasting && (
        <div className="delegates__form">
          <label className="record-sheet__field">
            <span className="record-sheet__field-label">
              One traveller per line — “Name, phone, passport” (phone and passport optional)
            </span>
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Rahul Verma, +91 98100 11111, L1234567\nAnita Desai"}
            />
          </label>
          <label className="record-sheet__field">
            <span className="record-sheet__field-label">Room type for everyone below</span>
            <select value={pasteRoomType} onChange={(e) => setPasteRoomType(e.target.value)}>
              {ROOM_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <div className="record-sheet__actions">
            <button type="button" onClick={() => void submitPaste()} disabled={busy}>
              Add everyone
            </button>
            <button type="button" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {members.length === 0 && !loading && !adding && !pasting && (
        <p className="record-sheet__hint">
          No delegates yet. Add them one at a time, or paste the whole list from your spreadsheet.
        </p>
      )}

      {members.length > 0 && (
        <table className="delegates__table">
          <thead>
            <tr>
              <th>Traveller</th>
              <th>Room</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.name}</strong>
                  <small>
                    {member.passport ? `Passport ${member.passport}` : "No passport on record"}
                    {member.dietary ? ` · ${member.dietary}` : ""}
                  </small>
                </td>
                <td>
                  {member.roomNumber || "—"}
                  <small>{member.roomType}</small>
                </td>
                <td>
                  <span
                    className={
                      member.status === "Confirmed"
                        ? "delegates__status"
                        : "delegates__status delegates__status--pending"
                    }
                  >
                    {member.status}
                  </span>
                </td>
                <td className="delegates__row-actions">
                  <button
                    type="button"
                    aria-label={`Edit ${member.name}`}
                    onClick={() => startEdit(member)}
                  >
                    <Pencil size={13} />
                  </button>
                  {confirmingId === member.id ? (
                    <button
                      type="button"
                      className="delegates__danger"
                      onClick={() => void removeMember(member)}
                      disabled={busy}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setConfirmingId(member.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
