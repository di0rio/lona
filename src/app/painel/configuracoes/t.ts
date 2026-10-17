export default {
	title: { pt: "Como sua empresa trabalha", en: "How your company works" },
	nav: { pt: "Configurações", en: "Settings" },
	description: {
		pt: "Cada opção muda como o sistema se comporta para todos os usuários da empresa. Salva na hora; dá para desfazer.",
		en: "Each option changes how the system behaves for everyone in the company. Saved instantly; you can undo.",
	},
	readOnly: {
		pt: "Só o dono muda estas opções. Você pode ver como estão, mas não alterar.",
		en: "Only the owner changes these options. You can see them but not change them.",
	},
	usesBranches: {
		label: { pt: "Usa filiais", en: "Uses branches" },
		help: {
			pt: "Ligado: estoque e caixa são separados por filial e as telas pedem a filial. Desligado: a empresa trabalha só com a matriz.",
			en: "On: stock and cash register are kept per branch and screens ask for the branch. Off: the company works with the headquarters only.",
		},
	},
	workOrderFlow: {
		label: {
			pt: "Ordem de serviço: simples ou completa",
			en: "Work order: simple or full",
		},
		simple: { pt: "Simples", en: "Simple" },
		simpleHelp: {
			pt: "Abre, executa e fecha. Sem etapas intermediárias.",
			en: "Open, do the work, close. No intermediate steps.",
		},
		full: { pt: "Completa", en: "Full" },
		fullHelp: {
			pt: "Passa por orçamento, aprovação do cliente, execução e entrega.",
			en: "Goes through quote, customer approval, execution and delivery.",
		},
	},
	saleRequiresQuote: {
		label: { pt: "Venda começa com orçamento", en: "Sale starts with a quote" },
		help: {
			pt: "Ligado: toda venda nasce de um orçamento aprovado. Desligado: dá para vender direto no balcão.",
			en: "On: every sale comes from an approved quote. Off: you can sell straight at the counter.",
		},
	},
	cashRegisterRequired: {
		label: {
			pt: "Caixa obrigatório para vender",
			en: "Cash register required to sell",
		},
		help: {
			pt: "Ligado: só vende quem abriu o caixa. Desligado: dá para vender sem caixa aberto.",
			en: "On: only someone with an open cash register can sell. Off: selling works without one.",
		},
	},
	saved: { pt: "Salvo.", en: "Saved." },
	undo: { pt: "Desfazer", en: "Undo" },
	error: {
		pt: "Não foi possível salvar agora. A opção voltou ao que era.",
		en: "Could not save right now. The option went back to what it was.",
	},
};
