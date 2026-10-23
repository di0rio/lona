/**
 * Passos do tour da demonstração, em ordem. Cada um aponta para um elemento com `data-tour="<anchor>"`.
 * Passo cujo elemento não existe ou não aparece na tela (ex.: menu lateral no celular) é pulado.
 * Um módulo novo (cadastros, estoque, venda) entra com uma linha aqui, o `data-tour` no elemento e o texto em `t.ts`.
 */
export const tourSteps = [
	{ id: "sidebar", anchor: "sidebar", placement: "right" },
	{ id: "search", anchor: "search", placement: "below", shortcut: true },
	{ id: "viewAs", anchor: "view-as", placement: "right" },
	{ id: "countdown", anchor: "countdown", placement: "below" },
] as const;

export type TourStepId = (typeof tourSteps)[number]["id"];
