-- GSTR-3B needs the supplier's GSTIN to split input credit into IGST vs
-- CGST + SGST. Without it every bill defaults to intra-state, which the
-- return then over-claims.
ALTER TABLE "Payable" ADD COLUMN "supplierGstin" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Expense" ADD COLUMN "vendorGstin" TEXT NOT NULL DEFAULT '';
