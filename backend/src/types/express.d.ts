import type { Action, PermissionSet } from "../domain/rbac";

/** Attached to the request by the auth middleware. */
export type AuthContext = {
  userId: string;
  organizationId: string;
  roleKey: string;
  branchId: string | null;
  email: string;
  name: string;
  permissions: PermissionSet;
  /** Present when the request is authenticated with an API key instead of a JWT. */
  apiKeyId?: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId: string;
    }
  }
}

export type { Action };
