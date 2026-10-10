import { treaty } from "@elysiajs/eden";
import type { App } from "@/api";

/** Cliente tipado da API (Eden) para componentes de cliente. O Eden pede o domínio ao criar, então só nasce na chamada. */
export const api = () => treaty<App>(window.location.origin).api;
