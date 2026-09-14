import { describe,expect,it } from "vitest";
import { bulkFromAmount,money,quantity } from "@/lib/money";

describe("dinheiro e venda fracionada",()=>{
  it("preserva exatamente o valor cobrado na venda por peso",()=>{const result=bulkFromAmount("37.90","12.00");expect(result.chargedAmount.toFixed(2)).toBe("12.00");expect(result.quantity.toFixed(3)).toBe("0.317")});
  it("arredonda dinheiro e quantidade em escalas diferentes",()=>{expect(money("10.005").toFixed(2)).toBe("10.01");expect(quantity("1.23456").toFixed(3)).toBe("1.235")});
  it("recusa preço por quilo inválido",()=>expect(()=>bulkFromAmount(0,12)).toThrow("Preço por quilo inválido"));
});
