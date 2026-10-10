import { type Limite, type Permissao, permissoes } from "./permissoes";

export type CargoPronto = {
	nome: string;
	permissoes: readonly Permissao[];
	/** null = sem limite. */
	limites: Record<Limite, number | null>;
};

// Os cinco cargos que toda empresa nasce tendo. A empresa pode editar e criar outros depois.
export const cargosProntos: readonly CargoPronto[] = [
	{
		nome: "dono",
		permissoes,
		limites: { desconto_maximo_pct: null, pedido_compra_maximo: null },
	},
	{
		nome: "gerente",
		permissoes: permissoes.filter(
			(p) => p !== "empresa.configurar" && p !== "cargos.gerenciar",
		),
		limites: { desconto_maximo_pct: 15, pedido_compra_maximo: 20000 },
	},
	{
		nome: "balconista",
		permissoes: [
			"estoque.ver",
			"estoque.ver_outras_filiais",
			"venda.criar",
			"os.criar",
			"cliente.ver",
			"cliente.editar",
			"caixa.operar",
		],
		limites: { desconto_maximo_pct: 5, pedido_compra_maximo: 0 },
	},
	{
		nome: "mecânico",
		permissoes: [
			"estoque.ver",
			"os.criar",
			"os.aplicar_peca",
			"os.lancar_mao_de_obra",
			"os.finalizar",
			"cliente.ver",
		],
		limites: { desconto_maximo_pct: 0, pedido_compra_maximo: 0 },
	},
	{
		nome: "financeiro",
		permissoes: [
			"compras.ver",
			"cliente.ver",
			"cliente.alterar_limite_credito",
			"financeiro.ver",
			"financeiro.receber",
			"financeiro.pagar",
			"caixa.fechar",
		],
		limites: { desconto_maximo_pct: 0, pedido_compra_maximo: 5000 },
	},
];
