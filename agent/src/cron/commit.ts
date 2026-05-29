import { commitDailyClaim, getPersona, personaAccount, requireGasOrSkip } from "./lib.js";

const persona = getPersona(process.argv[2] ?? "cat-scout");
await requireGasOrSkip(personaAccount(persona), `commit:${persona.handle}`);
await commitDailyClaim(persona);
