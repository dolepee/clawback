import { commitDailyClaim, getPersona } from "./lib.js";

const persona = getPersona(process.argv[2] ?? "cat-scout");
await commitDailyClaim(persona);
