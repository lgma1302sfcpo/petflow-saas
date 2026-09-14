import { z } from "zod";

const username = z
  .string()
  .trim()
  .min(3, "Informe ao menos 3 caracteres.")
  .max(40)
  .regex(/^[a-z0-9._-]+$/i, "Use somente letras, números, ponto, hífen ou sublinhado.");

export const loginSchema = z.object({
  workspace: z.string().trim().min(2).max(60),
  username,
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(128),
});

export const tenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  document: z.string().trim().min(11).max(18).optional(),
  planId: z.string().cuid(),
  adminName: z.string().trim().min(2).max(120),
  adminUsername: username,
  adminPassword: z.string().min(10).max(128),
});

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(24).regex(/^[A-Z0-9_-]+$/i),
});

export const employeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  username,
  password: z.string().min(10).max(128),
  roleId: z.string().cuid(),
  branchIds: z.array(z.string().cuid()).min(1, "Selecione ao menos uma loja."),
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(240).optional(),
  maxBranches: z.coerce.number().int().min(1).max(100),
  maxUsers: z.coerce.number().int().min(1).max(10_000),
  enabledModules: z.array(z.string().min(2)).default([]),
  enabledFeatures: z.array(z.string().min(2)).default([]),
  active: z.boolean().default(true),
});

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  permissionKeys: z.array(z.string()).min(1),
});

export const tenantSettingsSchema = z.object({
  brandName: z.string().trim().min(2).max(120).optional(),
  logoUrl: z.preprocess(value=>value===""?null:value,z.string().url().max(1000).nullable().optional()),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  allowNegativeStock: z.boolean().optional(),
  shareProductsAcrossBranches: z.boolean().optional(),
  shareCustomersAcrossBranches: z.boolean().optional(),
  customerRequiredOnSale: z.boolean().optional(),
  bulkSaleEnabled: z.boolean().optional(),
  professionalCommissionEnabled: z.boolean().optional(),
  whatsappRemindersEnabled: z.boolean().optional(),
  simultaneousAppointments: z.number().int().min(1).max(20).optional(),
  acceptedPaymentMethods: z.array(z.string().min(2)).optional(),
  requiredCustomerFields: z.array(z.string().min(2)).optional(),
  customFeatures: z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).optional(),
});
