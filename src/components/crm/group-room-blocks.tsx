import { useState } from "react";
import { Plus, Trash2, Bed, Clock } from "lucide-react";
import { toast } from "sonner";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  fetchAllotments,
  fetchRoomBlocks,
  holdRoomBlock,
  releaseRoomBlock,
  type RoomBlockDto,
} from "@/lib/api/ops";

/* ===========================================================================
   Rooms held — link a hotel contract to this group.

   This is not the rooming list (who sleeps where). A room block says how many
   rooms this group has taken out of a hotel's contracted allocation — the
   same rooms cannot be promised to two group trips at once. The backend
   claims rooms inside one transaction, so two people holding the last room at
   the same moment cannot both succeed.
   =========================================================================== */

type BlockRow = Pick<
  RoomBlockDto,
  "id" | "hotelName" | "roomType" | "roomsHeld" | "linkedAt" | "notes"
> & {
  availableRooms: number;
  status: string;
};

type ContractOption = {
  id: string;
  label: string;
  available: number;
};

export function GroupRoomBlocksSection({ recordId }: { recordId: string }) {
  const { data: blocks, loading: blocksLoading, error: blocksError, reload: reloadBlocks } =
    useApiQuery<RoomBlockDto[]>(() => fetchRoomBlocks(recordId), [recordId]);

  const { data: allotments, loading: allotmentsLoading } = useApiQuery(
    () => fetchAllotments({}),
    [],
  );

  const contracts: ContractOption[] =
    allotments?.items
      ?.filter((a) => a.status === "Open" && (a.availableRooms ?? 0) > 0)
      .map((a) => ({
        id: a.id,
        label: `${a.hotelName} · ${a.roomType} — ${a.availableRooms} free of ${a.totalRooms}`,
        available: a.availableRooms,
      })) ?? [];

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    allotmentId: "",
    roomsHeld: "1",
    notes: "",
  });

  const setField = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submitHold = async () => {
    if (!form.allotmentId) {
      toast.error("Choose a hotel contract first");
      return;
    }
    const rooms = Number(form.roomsHeld);
    if (!Number.isFinite(rooms) || rooms <= 0) {
      toast.error("Number of rooms must be more than zero");
      return;
    }
    const contract = contracts.find((c) => c.id === form.allotmentId);
    if (contract && rooms > contract.available) {
      toast.error(`Only ${contract.available} room(s) free on this contract`);
      return;
    }
    setBusy(true);
    try {
      await holdRoomBlock(recordId, {
        allotmentId: form.allotmentId,
        roomsHeld: rooms,
        notes: form.notes,
      });
      setForm({ allotmentId: "", roomsHeld: "1", notes: "" });
      setAdding(false);
      await reloadBlocks();
      toast.success("Rooms held against the contract");
    } catch (err) {
      toast.error(errorMessage(err, "Could not hold the rooms"));
    } finally {
      setBusy(false);
    }
  };

  const releaseBlock = async (block: BlockRow) => {
    setReleasingId(block.id);
    try {
      await releaseRoomBlock(recordId, block.id);
      setConfirmingId(null);
      setReleasingId(null);
      await reloadBlocks();
      toast.success("Rooms released back to the contract");
    } catch (err) {
      setConfirmingId(null);
      setReleasingId(null);
      toast.error(errorMessage(err, "Could not release the rooms"));
    }
  };

  const rows: BlockRow[] = (blocks ?? []).map((b) => ({
    id: b.id,
    hotelName: b.hotelName,
    roomType: b.roomType,
    roomsHeld: b.roomsHeld,
    linkedAt: b.linkedAt,
    notes: b.notes,
    availableRooms: b.allotment?.availableRooms ?? 0,
    status: b.allotment?.status ?? "deleted",
  }));

  return (
    <section className="record-sheet__section">
      <h4>
        <Bed size={14} /> Rooms held
      </h4>
      <p className="record-sheet__hint">
        Rooms this group has taken out of a hotel contract. Held rooms are not
        promised to another group trip; releasing a block puts them back.
      </p>

      {blocksLoading && !blocks && <p className="record-sheet__hint">Loading rooms…</p>}
      {blocksError && <p className="record-sheet__hint">{blocksError}</p>}

      <div className="record-sheet__actions">
        <button
          type="button"
          className={adding ? "delegates__action--active" : undefined}
          onClick={() => setAdding((open) => !open)}
        >
          <Plus size={14} /> {adding ? "Cancel" : "Hold rooms"}
        </button>
        <button type="button" onClick={() => void reloadBlocks()} disabled={blocksLoading}>
          <Clock size={14} /> Refresh
        </button>
      </div>

      {adding && (
        <div className="delegates__form">
          <div className="record-sheet__field-row">
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Hotel contract</span>
              <select
                value={form.allotmentId}
                onChange={(e) => setField("allotmentId")(e.target.value)}
              >
                <option value="">Choose a contract</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {allotmentsLoading && <span className="record-sheet__hint">Loading contracts…</span>}
            </label>
            <label className="record-sheet__field">
              <span className="record-sheet__field-label">Rooms</span>
              <input
                type="number"
                min="1"
                max="500"
                value={form.roomsHeld}
                onChange={(e) => setField("roomsHeld")(e.target.value)}
                placeholder="1"
              />
            </label>
          </div>
          <label className="record-sheet__field">
            <span className="record-sheet__field-label">Notes</span>
            <input
              value={form.notes}
              onChange={(e) => setField("notes")(e.target.value)}
              placeholder="Twin sharing, near the lift"
            />
          </label>
          <div className="record-sheet__actions">
            <button type="button" onClick={submitHold} disabled={busy}>
              Hold rooms
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding && !blocksLoading && !blocksError && (
        <p className="record-sheet__hint">
          No rooms held yet. Pick a contract above to block rooms for this group.
        </p>
      )}

      {rows.length > 0 && (
        <table className="delegates__table">
          <thead>
            <tr>
              <th>Hotel</th>
              <th>Room type</th>
              <th>Rooms held</th>
              <th>Free on contract</th>
              <th>Linked</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.hotelName}</strong>{" "}
                  {row.notes ? <small>({row.notes})</small> : null}
                </td>
                <td>{row.roomType}</td>
                <td>{row.roomsHeld}</td>
                <td>{row.availableRooms}</td>
                <td>{new Date(row.linkedAt).toLocaleDateString("en-IN")}</td>
                <td>
                  <span
                    className={
                      row.status === "Open"
                        ? "delegates__status"
                        : "delegates__status delegates__status--pending"
                    }
                  >
                    {row.status}
                  </span>
                </td>
                <td className="delegates__row-actions">
                  {confirmingId === row.id ? (
                    <button
                      type="button"
                      className="delegates__danger"
                      onClick={() => void releaseBlock(row)}
                      disabled={releasingId === row.id}
                    >
                      Release?
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Release ${row.roomsHeld} room(s) at ${row.hotelName}`}
                      onClick={() => setConfirmingId(row.id)}
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
