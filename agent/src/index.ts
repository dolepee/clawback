import { runPersona } from "./personas.js";

const personaArg = process.argv[2] ?? "cat-scout";
const action = process.argv[3] ?? "post";

await runPersona(personaArg, action);
