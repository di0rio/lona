import { describe, expect, test } from "vitest";
import {
	formatPlate,
	isValidPlate,
	normalizePlate,
	STATES,
} from "./validation";

describe("plate", () => {
	test("normalizes case, hyphen and spaces", () => {
		expect(normalizePlate("abc-1234")).toBe("ABC1234");
		expect(normalizePlate(" abc 1d23 ")).toBe("ABC1D23");
	});

	test("accepts old and Mercosul plates", () => {
		expect(isValidPlate("ABC1234")).toBe(true);
		expect(isValidPlate("ABC1D23")).toBe(true);
	});

	test("rejects the wrong shapes", () => {
		for (const plate of [
			"AB12345",
			"ABCD123",
			"ABC123",
			"ABC12345",
			"abc1234",
		]) {
			expect(isValidPlate(plate), plate).toBe(false);
		}
	});

	test("formats old plates with hyphen and keeps Mercosul", () => {
		expect(formatPlate("abc1234")).toBe("ABC-1234");
		expect(formatPlate("abc-1d23")).toBe("ABC1D23");
	});

	test("has the 27 states", () => {
		expect(new Set(STATES).size).toBe(27);
	});
});
