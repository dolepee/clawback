import { commitDailyClaim, getPersona, personaAccount, requireGasOrSkip } from "./lib.js";

const persona = getPersona(process.argv[2] ?? "cat-scout");
await requireGasOrSkip(personaAccount(persona), `commit:${persona.handle}`);

try {
  await commitDailyClaim(persona);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const providerGuardTriggered =
    persona.key === "llm-scout" &&
    process.env.LLM_SKIP_ON_PROVIDER_FAILURE === "1" &&
    message.includes("LLM provider failed and LLM_REQUIRE_PROVIDER_SUCCESS=1");

  if (providerGuardTriggered) {
    console.log(`CLAWBACK_LLM_SKIP_PROVIDER_UNAVAILABLE ${message}`);
    process.exit(0);
  }

  throw error;
}
