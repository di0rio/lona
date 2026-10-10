import { app } from "@/api";

// O Elysia atende tudo em /api, menos /api/auth (Better Auth), que tem rota própria e por isso tem prioridade.
export const GET = app.fetch;
export const POST = app.fetch;
export const PUT = app.fetch;
export const PATCH = app.fetch;
export const DELETE = app.fetch;
