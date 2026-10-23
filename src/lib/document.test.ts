import { describe, expect, test } from "vitest";
import {
	formatDocument,
	isValidCnpj,
	isValidCpf,
	onlyDigits,
	withCheckDigits,
} from "./document";

describe("document", () => {
	test("onlyDigits strips the mask", () => {
		expect(onlyDigits("529.982.247-25")).toBe("52998224725");
	});

	test("isValidCpf accepts valid CPFs with or without mask", () => {
		expect(isValidCpf("52998224725")).toBe(true);
		expect(isValidCpf("529.982.247-25")).toBe(true);
		expect(isValidCpf("11144477735")).toBe(true);
	});

	test("isValidCpf rejects wrong check digits, size and repeated digits", () => {
		expect(isValidCpf("52998224726")).toBe(false);
		expect(isValidCpf("5299822472")).toBe(false);
		expect(isValidCpf("11111111111")).toBe(false);
		expect(isValidCpf("")).toBe(false);
	});

	test("isValidCnpj accepts valid CNPJs with or without mask", () => {
		expect(isValidCnpj("11222333000181")).toBe(true);
		expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
		expect(isValidCnpj("11444777000161")).toBe(true);
	});

	test("isValidCnpj rejects wrong check digits, size and repeated digits", () => {
		expect(isValidCnpj("11222333000182")).toBe(false);
		expect(isValidCnpj("1122233300018")).toBe(false);
		expect(isValidCnpj("00000000000000")).toBe(false);
		expect(isValidCnpj("52998224725")).toBe(false);
	});

	test("formatDocument masks CPF and CNPJ", () => {
		expect(formatDocument("52998224725")).toBe("529.982.247-25");
		expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
		expect(formatDocument("123")).toBe("123");
	});

	test("withCheckDigits completes a CPF and a CNPJ base", () => {
		expect(withCheckDigits("529982247")).toBe("52998224725");
		expect(withCheckDigits("112223330001")).toBe("11222333000181");
	});
});
