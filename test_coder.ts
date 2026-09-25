import { BorshCoder } from "@coral-xyz/anchor";
import idl from "./apps/web/src/idl/prism.json" with { type: "json" };
const coder = new BorshCoder(idl as any);
console.log(coder.instruction.format({} as any, []));
