import { describe, expect, test } from "vitest";
import { localePath, stripLocale } from "./path";

describe("localePath", () => {
	test("português fica sem prefixo", () => {
		expect(localePath("pt", "/")).toBe("/");
		expect(localePath("pt", "/painel")).toBe("/painel");
	});

	test("inglês ganha /en", () => {
		expect(localePath("en", "/")).toBe("/en");
		expect(localePath("en", "/painel")).toBe("/en/painel");
	});
});

describe("stripLocale", () => {
	test("tira o prefixo de idioma", () => {
		expect(stripLocale("/en/painel")).toBe("/painel");
		expect(stripLocale("/pt/painel")).toBe("/painel");
		expect(stripLocale("/en")).toBe("/");
	});

	test("não confunde /english com /en", () => {
		expect(stripLocale("/english")).toBe("/english");
	});
});
