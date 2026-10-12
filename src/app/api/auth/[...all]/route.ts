import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/access";

export const { GET, POST } = toNextJsHandler(auth);
