/**
 * Keeping credentials out of API responses.
 *
 * Organisation channel settings, integration configs and webhook secrets all
 * live in JSON blobs so a workspace can be configured without a migration for
 * every supplier. That convenience is only safe if the *read* path never
 * returns the raw blob: a viewer, an accountant or a read-only API key must
 * not be able to lift the company's SMTP password or payment gateway secret.
 *
 * These helpers are deliberately allow-list shaped: anything whose key looks
 * like a credential is masked, no matter where it sits in the object.
 */

const SECRET_KEY = /(pass(word)?|secret|token|api[_-]?key|private[_-]?key|key[_-]?secret|authorization|credential|cookie|session)/i;

/** True when a JSON key is expected to hold a credential. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** Masks one value while still telling the reader that something is stored. */
export function maskValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  if (raw.length <= 6) return "••••";
  return `${raw.slice(0, 3)}••••${raw.slice(-3)}`;
}

/**
 * Returns a deep copy with every credential-looking value replaced by a mask.
 * Non-secret keys are preserved so the UI can still render host names, ports,
 * phone number ids and "connected" flags.
 */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key)) {
        out[key] = maskValue(entry);
      } else {
        out[key] = redactSecrets(entry);
      }
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * The org settings a client may read: everything except the `channels` blob,
 * which is replaced with a short "configured" summary. Channel detail is
 * served by GET /channels, which knows who is asking.
 */
export function publicOrganizationSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const { channels, ...rest } = settings as {
    channels?: { email?: unknown; whatsapp?: unknown; razorpay?: unknown };
  } & Record<string, unknown>;

  if (!channels) return rest;

  return {
    ...rest,
    // A presence flag is all the shell needs; never the values.
    channels: {
      email: Boolean(channels.email),
      whatsapp: Boolean(channels.whatsapp),
      razorpay: Boolean(channels.razorpay),
    },
  };
}
