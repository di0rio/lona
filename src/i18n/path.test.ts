import { describe, expect, test } from "vitest";
import { localePath, stripLocale } from "./path";

describe("localePath", () => {
	test("portuguese has no prefix", () => {
		expect(localePath("pt", "/")).toBe("/");
		expect(localePath("pt", "/painel")).toBe("/painel");
	});

	test("english gets /en", () => {
		expect(localePath("en", "/")).toBe("/en");
		expect(localePath("en", "/painel")).toBe("/en/painel");
	});
});

describe("stripLocale", () => {
	test("strips the language prefix", () => {
		expect(stripLocale("/en/painel")).toBe("/painel");
		expect(stripLocale("/pt/painel")).toBe("/painel");
		expect(stripLocale("/en")).toBe("/");
	});

	test("does not confuse /english with /en", () => {
		expect(stripLocale("/english")).toBe("/english");
	});
});
