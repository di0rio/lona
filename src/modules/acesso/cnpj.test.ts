import { describe, expect, test } from "vitest";
import { cnpjDaFilial } from "./cnpj";

describe("cnpjDaFilial", () => {
	test("calcula os dígitos verificadores de um CNPJ conhecido", () => {
		expect(cnpjDaFilial("11222333", 1)).toBe("11222333000181");
		expect(cnpjDaFilial("11444777", 1)).toBe("11444777000161");
	});

	test("a ordem muda só o número depois da barra", () => {
		const filial = cnpjDaFilial("11222333", 2);
		expect(filial.slice(0, 12)).toBe("112223330002");
		expect(filial).toHaveLength(14);
	});
});
