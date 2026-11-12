import { readFile } from "node:fs/promises";
import net from "node:net";
import { env } from "../config/env";
import { ServiceUnavailableError } from "../lib/errors";

/**
 * Malware scanning for uploaded documents.
 *
 * Two layers:
 *   1. The EICAR test signature is always rejected locally, so the upload path
 *      has a working regression test without running a daemon.
 *   2. When `CLAMAV_HOST` is configured, the file is streamed to ClamAV using
 *      its INSTREAM protocol. If ClamAV is configured but unreachable, the
 *      upload fails closed — accepting a passport scan unscanned would defeat
 *      the point.
 *
 * EICAR alone is not antivirus. A production deployment should set
 * `CLAMAV_HOST` (a local `clamav/clamav` container is enough).
 */

const EICAR_SIGNATURE = [
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$",
  "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
].join("");

export type ScanResult = {
  clean: boolean;
  scanner: "eicar-only" | "clamav";
  signature?: string;
};

export type ScanOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
};

function clamavScan(buffer: Buffer, host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = "";
    let settled = false;

    const finish = (error: Error | null, clean?: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(Boolean(clean));
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () =>
      finish(new ServiceUnavailableError("The malware scanner did not respond in time")),
    );
    socket.on("error", () =>
      finish(new ServiceUnavailableError("The malware scanner is unavailable")),
    );
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, offset + 64 * 1024);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length, 0);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (!response.includes("\0") && !response.includes("\n")) return;
      if (response.includes("FOUND")) finish(null, false);
      else if (response.includes("OK")) finish(null, true);
      else finish(new ServiceUnavailableError("The malware scanner returned an unknown response"));
    });
    socket.on("close", () => {
      if (!settled) {
        if (response.includes("FOUND")) finish(null, false);
        else if (response.includes("OK")) finish(null, true);
        else finish(new ServiceUnavailableError("The malware scanner closed the connection"));
      }
    });
  });
}

export async function scanBuffer(buffer: Buffer, options: ScanOptions = {}): Promise<ScanResult> {
  if (buffer.toString("latin1").includes(EICAR_SIGNATURE)) {
    return { clean: false, scanner: "eicar-only", signature: "EICAR-Test-Signature" };
  }

  const host = options.host ?? env.CLAMAV_HOST;
  if (!host) return { clean: true, scanner: "eicar-only" };

  const clean = await clamavScan(
    buffer,
    host,
    options.port ?? env.CLAMAV_PORT,
    options.timeoutMs ?? env.CLAMAV_TIMEOUT_MS,
  );
  return { clean, scanner: "clamav", ...(clean ? {} : { signature: "ClamAV detected malware" }) };
}

export async function scanFile(filePath: string, options: ScanOptions = {}): Promise<ScanResult> {
  return scanBuffer(await readFile(filePath), options);
}
