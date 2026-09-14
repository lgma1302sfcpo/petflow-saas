import "next-auth";
import "next-auth/jwt";

type AppUser = {
  kind: "PLATFORM" | "TENANT";
  tenantId?: string;
  tenantName?: string;
  branchIds: string[];
  permissions: string[];
  valid: boolean;
};

declare module "next-auth" {
  interface User {
    kind?: AppUser["kind"];
    tenantId?: string;
    tenantName?: string;
    branchIds?: string[];
    permissions?: string[];
    valid?: boolean;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    } & AppUser;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kind?: AppUser["kind"];
    tenantId?: string;
    tenantName?: string;
    branchIds?: string[];
    permissions?: string[];
    valid?: boolean;
  }
}
