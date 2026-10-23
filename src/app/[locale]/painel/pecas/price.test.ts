import { describe, expect, it } from "vitest";
import { parsePrice } from "./price";

describe("parsePrice", () => {
	it("treats a dot without comma as the decimal separator", () => {
		expect(parsePrice("12.50")).toBe("12.50");
	});

	it("treats dots as thousands when there is a comma", () => {
		expect(parsePrice("1.234,56")).toBe("1234.56");
		expect(parsePrice("12,5")).toBe("12.5");
		expect(parsePrice("10")).toBe("10");
	});

	it("rejects ambiguous or malformed values", () => {
		expect(parsePrice("1.234")).toBeNull();
		expect(parsePrice("")).toBeNull();
		expect(parsePrice("abc")).toBeNull();
		expect(parsePrice("-5")).toBeNull();
	});
});
