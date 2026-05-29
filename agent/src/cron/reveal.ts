import { requireGasOrSkip, revealClaims, settlerAccount } from "./lib.js";

await requireGasOrSkip(settlerAccount(), "reveal");
await revealClaims();
