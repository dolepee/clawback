import { runPersona } from "./personas.js";

const personaArg = process.argv[2] ?? "cat-scout";
const action = process.argv[3] ?? "post";
const extra = process.argv.slice(4);

await runPersona(personaArg, action, extra);
