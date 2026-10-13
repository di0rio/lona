import { describe, expect, test } from "vitest";
import { branchCnpj } from "./cnpj";

describe("branchCnpj", () => {
	test("computes the check digits of a known CNPJ", () => {
		expect(branchCnpj("11222333", 1)).toBe("11222333000181");
		expect(branchCnpj("11444777", 1)).toBe("11444777000161");
	});

	test("the order only changes the number after the slash", () => {
		const branch = branchCnpj("11222333", 2);
		expect(branch.slice(0, 12)).toBe("112223330002");
		expect(branch).toHaveLength(14);
	});
});
