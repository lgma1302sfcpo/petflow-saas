import "server-only";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { clearAttempts, consumeAttempt } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/schemas";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Usuário e senha",
      credentials: {
        workspace: { label: "Empresa", type: "text" },
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { workspace, username, password } = parsed.data;
        const key = `${workspace.toLowerCase()}:${username.toLowerCase()}`;
        if (!consumeAttempt(key).allowed) return null;

        if (workspace.toLowerCase() === "plataforma") {
          const platformUser = await prisma.platformUser.findUnique({ where: { username } });
          if (!platformUser?.active || !(await compare(password, platformUser.passwordHash))) return null;
          clearAttempts(key);
          return { id: platformUser.id, name: platformUser.name, kind: "PLATFORM" };
        }

        const tenant = await prisma.tenant.findUnique({ where: { slug: workspace },include:{subscriptions:{orderBy:{createdAt:"desc"},take:1}} });
        const subscription=tenant?.subscriptions[0];
        const tenantExpired=tenant?.status==="TRIAL"&&tenant.trialEndsAt&&tenant.trialEndsAt<new Date();
        const subscriptionExpired=subscription?.currentPeriodEnd&&subscription.currentPeriodEnd<new Date();
        if (!tenant || !["TRIAL", "ACTIVE"].includes(tenant.status)||tenantExpired||subscriptionExpired||!subscription||!["TRIAL","ACTIVE"].includes(subscription.status)) return null;

        const user = await prisma.user.findUnique({
          where: { tenantId_username: { tenantId: tenant.id, username } },
          include: {
            branches: { select: { branchId: true } },
            role: { include: { permissions: { include: { permission: true } } } },
          },
        });
        if (!user || user.status !== "ACTIVE" || (user.lockedUntil && user.lockedUntil > new Date())) return null;

        if (!(await compare(password, user.passwordHash))) {
          const failedAttempts = user.failedAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts,
              lockedUntil: failedAttempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
            },
          });
          return null;
        }

        clearAttempts(key);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        return {
          id: user.id,
          name: user.name,
          kind: "TENANT",
          tenantId: tenant.id,
          tenantName: tenant.name,
          branchIds: user.branches.map((item) => item.branchId),
          permissions: user.role.permissions.map((item) => item.permission.key),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        Object.assign(token, user, { valid: true });
      } else if (token.sub && token.kind === "PLATFORM") {
        const current = await prisma.platformUser.findUnique({ where: { id: token.sub }, select: { active: true } });
        token.valid = Boolean(current?.active);
      } else if (token.sub && token.kind === "TENANT" && token.tenantId) {
        const current = await prisma.user.findFirst({
          where: { id: token.sub, tenantId: token.tenantId, status: "ACTIVE", deletedAt: null, tenant: { status: { in: ["TRIAL", "ACTIVE"] } } },
          include: { branches: { select: { branchId: true } }, role: { include: { permissions: { include: { permission: true } } } },tenant:{include:{subscriptions:{orderBy:{createdAt:"desc"},take:1}}} },
        });
        const subscription=current?.tenant.subscriptions[0];const expired=Boolean(current?.tenant.status==="TRIAL"&&current.tenant.trialEndsAt&&current.tenant.trialEndsAt<new Date()||subscription?.currentPeriodEnd&&subscription.currentPeriodEnd<new Date());
        token.valid = Boolean(current&&subscription&&["TRIAL","ACTIVE"].includes(subscription.status)&&!expired);
        if (current) {
          token.branchIds = current.branches.map((item) => item.branchId);
          token.permissions = current.role.permissions.map((item) => item.permission.key);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.kind = token.kind ?? "TENANT";
        session.user.tenantId = token.tenantId;
        session.user.tenantName = token.tenantName;
        session.user.branchIds = token.branchIds ?? [];
        session.user.permissions = token.permissions ?? [];
        session.user.valid = token.valid !== false;
      }
      return session;
    },
  },
};
