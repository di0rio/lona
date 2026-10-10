import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "@/api";
import { conectarComoDono, drizzleDoDono, temBanco } from "@/test/banco";
import { auth } from "./auth";
import { criarEmpresa, criarVinculo } from "./service";

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const senha = "senha-de-teste-123";
const novoEmail = () => `auth-${randomUUID().slice(0, 8)}@teste.lona.test`;

describe.skipIf(!temBanco)("Better Auth e a rota /api/acesso/painel", () => {
	let dono: pg.Pool;
	const empresaIds: string[] = [];
	const usuarioIds: string[] = [];

	beforeAll(() => {
		dono = conectarComoDono();
	});

	afterAll(async () => {
		await dono.query("DELETE FROM empresas WHERE id = ANY($1)", [empresaIds]);
		await dono.query("DELETE FROM autenticacao.usuarios WHERE id = ANY($1)", [
			usuarioIds,
		]);
		await dono.end();
	});

	// O Better Auth devolve a sessão em Set-Cookie; para mandar de volta basta o par nome=valor.
	const cookieDe = (resposta: Response) =>
		resposta.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");

	const painel = (cookie?: string) =>
		app.handle(
			new Request("http://localhost/api/acesso/painel", {
				headers: cookie ? { cookie } : {},
			}),
		);

	async function cadastrar(email: string) {
		const resposta = await auth.api.signUpEmail({
			body: { name: "Cadastro de teste", email, password: senha },
			asResponse: true,
		});
		const { user } = (await resposta.json()) as { user: { id: string } };
		usuarioIds.push(user.id);
		return { id: user.id, cookie: cookieDe(resposta), resposta };
	}

	test("cadastra com e-mail e senha e o id nasce UUIDv7 no banco", async () => {
		const cadastro = await cadastrar(novoEmail());
		expect(cadastro.resposta.status).toBe(200);
		expect(cadastro.id).toMatch(UUID_V7);
	});

	test("recusa e-mail repetido e senha errada", async () => {
		const email = novoEmail();
		await cadastrar(email);
		await expect(
			auth.api.signUpEmail({ body: { name: "Outra", email, password: senha } }),
		).rejects.toThrow();
		await expect(
			auth.api.signInEmail({ body: { email, password: "senha-errada-123" } }),
		).rejects.toThrow();
		await expect(
			auth.api.signInEmail({ body: { email, password: senha } }),
		).resolves.toBeDefined();
	});

	test("login anônimo cria um visitante", async () => {
		const resposta = await auth.api.signInAnonymous({ asResponse: true });
		const { user } = (await resposta.json()) as {
			user: { id: string; name: string; isAnonymous: boolean };
		};
		usuarioIds.push(user.id);
		expect(user).toMatchObject({ name: "Visitante", isAnonymous: true });
	});

	test("a rota do painel pede sessão", async () => {
		expect((await painel()).status).toBe(401);
	});

	test("com sessão mas sem empresa ativa, a rota do painel dá 404", async () => {
		const { cookie } = await cadastrar(novoEmail());
		expect((await painel(cookie)).status).toBe(404);
	});

	test("com vínculo numa empresa ativa, a rota do painel devolve empresa, filial e cargo", async () => {
		const bd = drizzleDoDono(dono);
		const empresa = await criarEmpresa(bd, {
			nome: "Empresa do painel",
			raizCnpj: "11222333",
			expiraEm: new Date(Date.now() + 60 * 60 * 1000),
		});
		empresaIds.push(empresa.empresaId);
		const { id, cookie } = await cadastrar(novoEmail());
		await criarVinculo(bd, {
			empresaId: empresa.empresaId,
			usuarioId: id,
			filialId: null,
			cargoId: empresa.cargoIds.balconista,
			nivel: "operar",
		});

		const resposta = await painel(cookie);
		expect(resposta.status).toBe(200);
		expect(await resposta.json()).toMatchObject({
			empresa: { id: empresa.empresaId, nome: "Empresa do painel" },
			filial: { nome: "Matriz", codigo: "MTZ" },
			cargo: "balconista",
			nivel: "operar",
		});

		// Vencida, a mesma sessão deixa de ter empresa.
		await dono.query(
			"UPDATE empresas SET expira_em = now() - interval '1 second' WHERE id = $1",
			[empresa.empresaId],
		);
		expect((await painel(cookie)).status).toBe(404);
	});
});
