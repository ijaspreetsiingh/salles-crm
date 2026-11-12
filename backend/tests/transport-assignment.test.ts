import { describe, expect, it } from "vitest";
import {
  findTransportConflict,
  type TransportCandidate,
} from "../src/services/transport-assignment";

/**
 * A vehicle or driver cannot be in two airports at once.
 *
 * The rule is one assignment per vehicle and per driver per calendar day,
 * because the data model has no drop time to compare against. These tests pin
 * the rule and, just as importantly, the cases where it must stay quiet: a
 * cancelled transfer, another day, or the same transfer being edited.
 */

const candidate = (
  overrides: Partial<TransportCandidate> & { extra?: string | null },
): TransportCandidate => ({
  id: "trf-1",
  reference: "TRF-1001",
  date: "2026-11-12",
  status: "Assigned",
  extra: JSON.stringify({ vehicleId: "veh-1", driverId: "drv-1" }),
  ...overrides,
});

describe("transport double-booking guard", () => {
  it("refuses a vehicle already out on another transfer that day", () => {
    const conflict = findTransportConflict(
      { transferId: "trf-2", date: "2026-11-12", vehicleId: "veh-1" },
      [candidate({})],
    );

    expect(conflict).toEqual({ kind: "vehicle", transferId: "trf-1", reference: "TRF-1001" });
  });

  it("refuses a driver already out on another transfer that day", () => {
    const conflict = findTransportConflict(
      { transferId: "trf-2", date: "2026-11-12", driverId: "drv-1" },
      [candidate({})],
    );

    expect(conflict).toEqual({ kind: "driver", transferId: "trf-1", reference: "TRF-1001" });
  });

  it("compares the calendar day, not the raw string", () => {
    const conflict = findTransportConflict(
      { transferId: "trf-2", date: "2026-11-12T18:30:00.000Z", vehicleId: "veh-1" },
      [candidate({ date: "2026-11-12" })],
    );

    expect(conflict?.kind).toBe("vehicle");
  });

  it("allows the same vehicle the next day", () => {
    expect(
      findTransportConflict({ transferId: "trf-2", date: "2026-11-13", vehicleId: "veh-1" }, [
        candidate({ date: "2026-11-12" }),
      ]),
    ).toBeNull();
  });

  it("never conflicts with the transfer being edited", () => {
    expect(
      findTransportConflict({ transferId: "trf-1", date: "2026-11-12", vehicleId: "veh-1" }, [
        candidate({ id: "trf-1" }),
      ]),
    ).toBeNull();
  });

  it("ignores transfers that are cancelled, completed or void", () => {
    for (const status of ["Cancelled", "Completed", "Void"]) {
      expect(
        findTransportConflict({ transferId: "trf-2", date: "2026-11-12", vehicleId: "veh-1" }, [
          candidate({ status }),
        ]),
      ).toBeNull();
    }
  });

  it("allows a different vehicle and driver on the same day", () => {
    expect(
      findTransportConflict(
        { transferId: "trf-2", date: "2026-11-12", vehicleId: "veh-9", driverId: "drv-9" },
        [candidate({})],
      ),
    ).toBeNull();
  });

  it("ignores an assignment with unreadable JSON instead of crashing", () => {
    expect(
      findTransportConflict({ transferId: "trf-2", date: "2026-11-12", vehicleId: "veh-1" }, [
        candidate({ extra: "not json" }),
      ]),
    ).toBeNull();
  });

  it("checks nothing when neither a vehicle nor a driver was chosen", () => {
    expect(
      findTransportConflict({ transferId: "trf-2", date: "2026-11-12" }, [candidate({})]),
    ).toBeNull();
  });
});
