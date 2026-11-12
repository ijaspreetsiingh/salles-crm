/**
 * Frontend API client — GST e-Invoicing (IRN/QR).
 */
import { apiRequest } from "./client";

export type IRNStatus = {
  hasIrn: boolean;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  generatedAt: string | null;
};

export type IRNGenerateResult =
  | { status: "not_configured"; message: string }
  | { status: "success"; irn: string; ackNo: string; ackDate: string; qrDataUrl: string };

/** Check if e-invoicing is configured on the server. */
export async function checkEInvoiceConfig(): Promise<{ configured: boolean; sandbox: boolean }> {
  return apiRequest("/einvoice/config");
}

/** Returns the IRN status for a finance record. */
export async function fetchIRNStatus(invoiceRecordId: string): Promise<IRNStatus> {
  return apiRequest(`/einvoice/${invoiceRecordId}/status`);
}

/** Returns the QR code data URL for embedding in PDF. */
export async function fetchIRNQrCode(invoiceRecordId: string): Promise<{ qrDataUrl: string }> {
  return apiRequest(`/einvoice/${invoiceRecordId}/qr`);
}

/**
 * Generates an IRN for a finance record.
 * Returns the IRN number and a QR code data URL for the invoice PDF.
 */
export async function generateIRN(
  invoiceRecordId: string,
  buyerDetails: {
    buyerGstin: string;
    buyerName: string;
    buyerAddr: string;
    buyerState: string;
    buyerPincode: string;
  },
): Promise<IRNGenerateResult> {
  return apiRequest(`/einvoice/${invoiceRecordId}/generate`, {
    method: "POST",
    body: buyerDetails,
  });
}
