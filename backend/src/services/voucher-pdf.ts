import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError } from "../lib/errors";

/**
 * Hotel / service vouchers.
 *
 * A voucher is the piece of paper a guest hands over at check-in. It has to
 * exist before anyone travels, so it is generated from the booking itself —
 * guest name, hotel, room, dates, inclusions and the agency's contact — rather
 * than retyped into a Word template.
 */
export async function generateVoucherPdf(input: {
  organizationId: string;
  recordId: string;
}): Promise<{ filename: string; stream: PDFKit.PDFDocument; voucherNo: string }> {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
  });
  if (!organization) throw new NotFoundError("Organization");

  const record = await prisma.record.findFirst({
    where: { id: input.recordId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!record) throw new NotFoundError("Booking");

  const extra = parseJson<Record<string, unknown>>(record.extra, {});
  const meta = parseJson<Record<string, unknown>>(record.meta, {});
  const voucherNo = `VCH-${record.reference.replace(/^[A-Z]+-/, "")}`;

  // The traveller list travels with the booking when one was captured.
  const travellers = Array.isArray(meta["travellers"])
    ? (meta["travellers"] as Array<Record<string, unknown>>).map((t) => String(t["name"] ?? ""))
    : [];
  const hotelName = String(meta["hotel"] ?? extra["hotel"] ?? record.destination ?? "");
  const roomType = String(meta["roomType"] ?? extra["roomType"] ?? "As per booking");
  const mealPlan = String(meta["mealPlan"] ?? extra["mealPlan"] ?? "");
  const checkIn = String(meta["checkIn"] ?? extra["checkIn"] ?? record.date ?? "");
  const checkOut = String(meta["checkOut"] ?? extra["checkOut"] ?? "");
  const nights = String(meta["nights"] ?? extra["nights"] ?? "");
  const confirmation = String(meta["confirmation"] ?? extra["supplierRef"] ?? "");

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const filename = `voucher-${record.reference}.pdf`;

  doc.rect(0, 0, doc.page.width, 96).fill("#2f5c50");
  doc.fillColor("#fbf8f2").font("Helvetica-Bold").fontSize(20).text(organization.name, 48, 34);
  doc.font("Helvetica").fontSize(9).fillColor("#dfeae5").text("Hotel / service voucher", 48, 62);

  doc
    .fillColor("#fbf8f2")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("VOUCHER", 0, 40, {
      width: doc.page.width - 48,
      align: "right",
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(voucherNo, 0, 64, { width: doc.page.width - 48, align: "right" });

  doc.fillColor("#17191a").font("Helvetica").fontSize(9);
  let y = 130;

  const row = (label: string, value: string) => {
    if (!value) return;
    doc
      .font("Helvetica-Bold")
      .fillColor("#7a7a7a")
      .fontSize(8)
      .text(label.toUpperCase(), 48, y, { width: 140 });
    doc
      .font("Helvetica")
      .fillColor("#17191a")
      .fontSize(10)
      .text(value, 190, y - 1, { width: 350 });
    y += 22;
  };

  row("Voucher no", voucherNo);
  row("Booking reference", record.reference);
  row("Guest", record.name);
  row("Contact", [record.phone, record.email].filter(Boolean).join(" · "));
  if (travellers.length) row("Travellers", travellers.join(", "));
  if (hotelName) row("Property", hotelName);
  if (record.destination) row("Destination", record.destination);
  if (roomType) row("Room", `${roomType}${mealPlan ? ` · ${mealPlan}` : ""}`);
  if (checkIn) row("Check-in", checkIn);
  if (checkOut) row("Check-out", checkOut);
  if (nights) row("Nights", nights);
  if (confirmation) row("Supplier confirmation", confirmation);
  row("Status", record.status);

  y += 10;
  doc
    .moveTo(48, y)
    .lineTo(doc.page.width - 48, y)
    .strokeColor("#dddddd")
    .stroke();
  y += 18;

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#17191a").text("Inclusions", 48, y);
  y += 18;
  doc.font("Helvetica").fontSize(10).fillColor("#333333");
  const inclusions =
    record.detail ||
    (Array.isArray(meta["inclusions"]) ? (meta["inclusions"] as unknown[]).join("\n") : "") ||
    "Room as booked, applicable taxes, and the services listed on the quotation.";
  doc.text(String(inclusions).slice(0, 1200), 48, y, { width: doc.page.width - 96 });
  y = doc.y + 18;

  doc
    .moveTo(48, y)
    .lineTo(doc.page.width - 48, y)
    .strokeColor("#dddddd")
    .stroke();
  y += 18;

  doc.font("Helvetica-Bold").fontSize(10).text("Important", 48, y);
  y += 16;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#555555")
    .text(
      [
        "Present this voucher at check-in along with a government photo id for each guest.",
        "Standard check-in is from 14:00 and check-out is by 11:00 unless the hotel says otherwise.",
        "Any extra service taken at the property is settled by the guest directly with the hotel.",
        record.notes ? `Notes: ${record.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      48,
      y,
      { width: doc.page.width - 96 },
    );

  const footerY = doc.page.height - 88;
  doc
    .fontSize(8)
    .fillColor("#777777")
    .text(`Issued by ${organization.name} on ${new Date().toLocaleString("en-IN")}`, 48, footerY);
  const contact = [
    organization.supportEmail ? `Email: ${organization.supportEmail}` : "",
    organization.phone ? `Phone: ${organization.phone}` : "",
    organization.address ?? "",
  ]
    .filter(Boolean)
    .join("  |  ");
  if (contact) doc.text(contact, 48, footerY + 12, { width: doc.page.width - 96 });
  doc.text(
    "This is a computer-generated voucher and does not require a signature.",
    48,
    footerY + 26,
  );

  return { filename, stream: doc, voucherNo };
}
