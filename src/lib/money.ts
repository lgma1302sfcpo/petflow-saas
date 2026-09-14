import { Prisma } from "@/generated/prisma/client";

type DecimalValue=string|number|Prisma.Decimal;
export function money(value:DecimalValue){return new Prisma.Decimal(value).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP)}
export function quantity(value:DecimalValue){return new Prisma.Decimal(value).toDecimalPlaces(3,Prisma.Decimal.ROUND_HALF_UP)}
export function bulkFromAmount(pricePerKg:DecimalValue,chargedAmount:DecimalValue){const price=money(pricePerKg);const charged=money(chargedAmount);if(price.lte(0))throw new Error("Preço por quilo inválido.");return {quantity:charged.div(price).toDecimalPlaces(3,Prisma.Decimal.ROUND_HALF_UP),chargedAmount:charged}}
export function brl(value:DecimalValue){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value))}
