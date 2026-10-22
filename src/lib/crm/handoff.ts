/**
 * Cross-page handoffs.
 *
 * Some flows cross pages: a lead's side panel sends you to the Customer
 * Information cover, or to Communications with that customer's contact already
 * open. The workspace is remounted per module, so these handovers travel
 * through sessionStorage instead of component state.
 */

export type CommsFocus = {
  /** The person's name. */
  name: string;
  /** Their email address. */
  email?: string | undefined;
  /** Their phone number. */
  phone?: string | undefined;
  /** Which channel the user asked for. */
  channel: "Email" | "WhatsApp" | "Call";
  /** Which module the conversation belongs to, when known. */
  module?: string | undefined;
  /** The record the conversation is about. */
  recordId?: string | undefined;
};

const COMMS_KEY = "traveldesk.commsFocus";
const PROFILE_KEY = "traveldesk.profileFocus";

/** Asks Communications to open this contact. */
export function setCommsFocus(focus: CommsFocus): void {
  try {
    sessionStorage.setItem(COMMS_KEY, JSON.stringify(focus));
  } catch {
    /* storage unavailable — the flow still works, just without the hand-off */
  }
}

/** Reads and clears the pending Communications hand-off. */
export function takeCommsFocus(): CommsFocus | null {
  try {
    const raw = sessionStorage.getItem(COMMS_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(COMMS_KEY);
    const parsed = JSON.parse(raw) as CommsFocus;
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

/** Asks the Customers page to open this person's full profile cover. */
export function setProfileFocus(row: unknown): void {
  try {
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

/** Reads and clears the pending profile hand-off. */
export function takeProfileFocus<T>(): T | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PROFILE_KEY);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
