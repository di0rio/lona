import { describe, expect, test } from "vitest";
import { branchCnpj, formatCnpj, isValidCnpj } from "./cnpj";

describe("formatCnpj", () => {
	test("puts the dots, slash and dash", () => {
		expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
	});
});

describe("isValidCnpj", () => {
	test("accepts numeric CNPJs with the right check digits", () => {
		expect(isValidCnpj("11222333000181")).toBe(true);
		expect(isValidCnpj("11444777000161")).toBe(true);
	});

	test("accepts the alphanumeric CNPJ from the Receita Federal example", () => {
		expect(isValidCnpj("12ABC34501DE35")).toBe(true);
		expect(formatCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
	});

	test("rejects a wrong check digit, wrong size, lowercase and a mask", () => {
		expect(isValidCnpj("11222333000182")).toBe(false);
		expect(isValidCnpj("1122233300018")).toBe(false);
		expect(isValidCnpj("12abc34501de35")).toBe(false);
		expect(isValidCnpj("11.222.333/0001-81")).toBe(false);
		expect(isValidCnpj("1122233300018A")).toBe(false);
	});
});

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
