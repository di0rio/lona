import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

// oklch(L C H) -> sRGB linear, pelo algoritmo da CSS Color 4 (via OKLab/LMS). Sem dependência nova: só
// matemática pura, usada apenas aqui para provar o contraste dos valores escolhidos em globals.css.
function oklchToLinearSrgb(l: number, c: number, h: number) {
	const hRad = (h * Math.PI) / 180;
	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);

	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;

	const ll = l_ ** 3;
	const mm = m_ ** 3;
	const ss = s_ ** 3;

	const r = 4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss;
	const g = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss;
	const bl = -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss;

	return [r, g, bl] as const;
}

/** Luminância relativa do WCAG: usa os canais lineares direto (já é o que o passo linear do oklch devolve). */
function relativeLuminance([r, g, b]: readonly [number, number, number]) {
	const clamp = (x: number) => Math.min(1, Math.max(0, x));
	return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(
	oklchA: [number, number, number],
	oklchB: [number, number, number],
) {
	const luminanceA = relativeLuminance(oklchToLinearSrgb(...oklchA));
	const luminanceB = relativeLuminance(oklchToLinearSrgb(...oklchB));
	const lighter = Math.max(luminanceA, luminanceB);
	const darker = Math.min(luminanceA, luminanceB);
	return (lighter + 0.05) / (darker + 0.05);
}

/** Lê `--name: oklch(L C H)` de dentro do texto de um bloco CSS. */
function oklchFromVariable(
	cssBlock: string,
	name: string,
): [number, number, number] {
	const match = cssBlock.match(new RegExp(`--${name}:\\s*oklch\\(([^)]*)\\)`));
	if (!match) throw new Error(`--${name} não encontrado no block`);
	const [l, c, h] = match[1].trim().split(/\s+/).map(Number);
	return [l, c, h];
}

/** Acha o conteúdo de um bloco `selector { ... }`, sem casar seletores mais específicos (ex.: `:root` vs `:root[data-color="x"]`). */
function cssBlock(selector: string) {
	// Escapa todo caractere especial de regex, inclusive a barra invertida.
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
	if (!match)
		throw new Error(`block "${selector}" não encontrado em globals.css`);
	return match[1];
}

const colors = [
	"gray",
	"blue",
	"green",
	"red",
	"orange",
	"yellow",
	"purple",
	"pink",
] as const;

describe("contrast of --primary x --primary-foreground per company color", () => {
	for (const color of colors) {
		for (const theme of ["light", "dark"] as const) {
			it(`${color} in ${theme} theme passes WCAG AA (4.5:1)`, () => {
				// "gray" é o neutro padrão: não tem block [data-color], usa :root/.dark direto.
				const selector =
					color === "gray"
						? theme === "light"
							? ":root"
							: ".dark"
						: theme === "light"
							? `:root[data-color="${color}"]`
							: `.dark[data-color="${color}"]`;
				const block = cssBlock(selector);
				const primary = oklchFromVariable(block, "primary");
				const primaryForeground = oklchFromVariable(
					block,
					"primary-foreground",
				);

				expect(
					contrastRatio(primary, primaryForeground),
				).toBeGreaterThanOrEqual(4.5);
			});
		}
	}
});
