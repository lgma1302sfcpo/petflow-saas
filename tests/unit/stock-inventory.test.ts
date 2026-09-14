import { describe,expect,it } from "vitest";
import { quantity } from "@/lib/money";
describe("movimentação de inventário",()=>{
  it("registra a diferença entre saldo contado e saldo anterior",()=>{const previous=quantity("12.500"),counted=quantity("10.250");expect(counted.minus(previous).toFixed(3)).toBe("-2.250")});
  it("registra entrada quando o inventário aumenta",()=>{const previous=quantity("2"),counted=quantity("3.125");expect(counted.minus(previous).toFixed(3)).toBe("1.125")});
});
