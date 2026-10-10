import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/acesso";

export const { GET, POST } = toNextJsHandler(auth);
