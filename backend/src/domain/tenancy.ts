/**
 * Traveldesk's own workspace inside the product.
 *
 * The vendor's staff (the platform super admin) must never be a member of a
 * customer company: seats, team lists and branch scoping all belong to the
 * tenant. The super admin therefore lives here, and every tenant-facing query
 * filters this organisation out.
 */
export const INTERNAL_ORG_SLUG = "traveldesk-hq";
