import { existsSync } from "node:fs";

// Local: pega o banco do .env.local. No CI as variáveis já vêm do ambiente (ou não vêm, e a integração pula).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
