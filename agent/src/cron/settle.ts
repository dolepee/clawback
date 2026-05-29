import { requireGasOrSkip, settleClaims, settlerAccount } from "./lib.js";

await requireGasOrSkip(settlerAccount(), "settle");
await settleClaims();
