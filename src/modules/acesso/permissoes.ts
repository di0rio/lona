// Catálogo de permissões: vive no código (não no banco) porque cada permissão só faz sentido onde alguém a confere.
// Quem confere é o service do módulo dono da ação; o cargo só guarda o nome em cargo_permissoes.
export const permissoes = [
	"estoque.ver",
	"estoque.ver_outras_filiais",
	"estoque.ajustar",
	"compras.ver",
	"compras.criar_pedido",
	"compras.dar_entrada",
	"venda.criar",
	"venda.finalizar_direto",
	"venda.cancelar",
	"os.criar",
	"os.aplicar_peca",
	"os.lancar_mao_de_obra",
	"os.finalizar",
	"cliente.ver",
	"cliente.editar",
	"cliente.alterar_limite_credito",
	"caixa.operar",
	"caixa.fechar",
	"financeiro.ver",
	"financeiro.receber",
	"financeiro.pagar",
	"liberacao.dar",
	"cargos.gerenciar",
	"usuarios.gerenciar",
	"empresa.configurar",
] as const;

export type Permissao = (typeof permissoes)[number];

// Limites: o máximo que o cargo faz sem pedir liberação. Sem linha em cargo_limites o cargo não tem folga nenhuma;
// valor NULL quer dizer sem limite.
export const limites = ["desconto_maximo_pct", "pedido_compra_maximo"] as const;

export type Limite = (typeof limites)[number];
