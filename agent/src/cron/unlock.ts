import { payerAccount, requireGasOrSkip, unlockClaims } from "./lib.js";

await requireGasOrSkip(payerAccount(), "unlock");
await unlockClaims();
