export default {
	title: { pt: "Cargos", en: "Roles" },
	nav: { pt: "Cargos", en: "Roles" },
	description: {
		pt: "Cada cargo é um conjunto de permissões e limites. Os cargos prontos podem ser editados; os que você cria também podem ser apagados.",
		en: "Each role is a set of permissions and limits. Ready roles can be edited; the ones you create can also be deleted.",
	},
	readOnly: {
		pt: "Só quem gerencia cargos cria e altera. Você pode ver como cada cargo está, mas não mudar.",
		en: "Only people who manage roles create and change them. You can see how each role is set up, but not change it.",
	},
	table: {
		name: { pt: "Cargo", en: "Role" },
		members: { pt: "Vínculos", en: "Memberships" },
		permissions: { pt: "Permissões", en: "Permissions" },
		actions: { pt: "Ações", en: "Actions" },
		ready: { pt: "Pronto", en: "Ready" },
	},
	empty: {
		title: { pt: "Nenhum cargo ainda", en: "No roles yet" },
		text: {
			pt: "Crie o primeiro cargo para dizer o que cada pessoa pode fazer.",
			en: "Create the first role to say what each person can do.",
		},
	},
	new: { pt: "Novo cargo", en: "New role" },
	edit: { pt: "Editar", en: "Edit" },
	view: { pt: "Ver", en: "View" },
	delete: { pt: "Apagar", en: "Delete" },
	confirm: {
		title: { pt: "Apagar este cargo?", en: "Delete this role?" },
		text: {
			pt: "Isso não pode ser desfeito. Só dá para apagar cargo que nenhum vínculo usa.",
			en: "This cannot be undone. Only a role that no membership uses can be deleted.",
		},
		cancel: { pt: "Cancelar", en: "Cancel" },
		confirm: { pt: "Apagar", en: "Delete" },
	},
	form: {
		newTitle: { pt: "Novo cargo", en: "New role" },
		editTitle: { pt: "Editar cargo", en: "Edit role" },
		viewTitle: { pt: "Cargo", en: "Role" },
		name: { pt: "Nome", en: "Name" },
		nameRequired: {
			pt: "Informe o nome do cargo.",
			en: "Enter the role name.",
		},
		copyFrom: { pt: "Partir de uma cópia de", en: "Start from a copy of" },
		copyNone: { pt: "Começar do zero", en: "Start from scratch" },
		permissions: { pt: "Permissões", en: "Permissions" },
		limits: { pt: "Limites", en: "Limits" },
		limitsHelp: {
			pt: "O máximo que o cargo faz sem pedir liberação. Deixe vazio para não ter limite.",
			en: "The most the role can do without asking for an override. Leave empty for no limit.",
		},
		noLimit: { pt: "sem limite", en: "no limit" },
		limitInvalid: {
			pt: "Use um número a partir de 0, ou deixe vazio.",
			en: "Use a number from 0, or leave empty.",
		},
		save: { pt: "Salvar", en: "Save" },
		saving: { pt: "Salvando...", en: "Saving..." },
		error: {
			pt: "Não foi possível salvar agora. Tente de novo.",
			en: "Could not save right now. Try again.",
		},
	},
	limit: {
		max_discount_pct: {
			label: { pt: "Desconto máximo", en: "Maximum discount" },
			unit: { pt: "%", en: "%" },
		},
		max_purchase_order: {
			label: { pt: "Pedido de compra máximo", en: "Maximum purchase order" },
			unit: { pt: "R$", en: "R$" },
		},
	},
	groups: {
		inventory: { pt: "Estoque", en: "Inventory" },
		purchasing: { pt: "Compras", en: "Purchasing" },
		sale: { pt: "Venda", en: "Sales" },
		work_order: { pt: "Ordem de serviço", en: "Work orders" },
		customer: { pt: "Clientes", en: "Customers" },
		cash_register: { pt: "Caixa", en: "Cash register" },
		finance: { pt: "Financeiro", en: "Finance" },
		override: { pt: "Liberação", en: "Overrides" },
		admin: { pt: "Administração", en: "Administration" },
		payment_methods: { pt: "Pagamentos", en: "Payments" },
	},
	permissions: {
		payment_methods: {
			manage: {
				pt: "Gerenciar formas, operadoras, taxas e condições de pagamento",
				en: "Manage payment methods, acquirers, fees and terms",
			},
		},
		inventory: {
			view: { pt: "Consultar o estoque", en: "View stock" },
			view_other_branches: {
				pt: "Consultar o estoque de outras filiais",
				en: "View other branches' stock",
			},
			adjust: { pt: "Ajustar o estoque", en: "Adjust stock" },
		},
		purchasing: {
			view: { pt: "Ver as compras", en: "View purchases" },
			create_order: {
				pt: "Fazer pedido de compra",
				en: "Create purchase orders",
			},
			receive: {
				pt: "Dar entrada de mercadoria",
				en: "Receive goods",
			},
		},
		sale: {
			create: { pt: "Fazer venda de balcão", en: "Make counter sales" },
			finalize_direct: {
				pt: "Finalizar venda sem orçamento",
				en: "Finalize a sale without a quote",
			},
			cancel: { pt: "Cancelar venda", en: "Cancel sales" },
		},
		work_order: {
			create: { pt: "Abrir ordem de serviço", en: "Open work orders" },
			apply_part: {
				pt: "Aplicar peça na ordem de serviço",
				en: "Apply parts to a work order",
			},
			log_labor: { pt: "Lançar mão de obra", en: "Log labor" },
			finish: {
				pt: "Finalizar ordem de serviço",
				en: "Finish work orders",
			},
		},
		customer: {
			view: { pt: "Ver clientes", en: "View customers" },
			create: { pt: "Cadastrar clientes", en: "Add customers" },
			edit: { pt: "Alterar clientes", en: "Edit customers" },
			change_credit_limit: {
				pt: "Mudar o limite de crédito do cliente",
				en: "Change a customer's credit limit",
			},
		},
		cash_register: {
			operate: { pt: "Trabalhar no caixa", en: "Work at the cash register" },
			close: { pt: "Fechar o caixa", en: "Close the cash register" },
		},
		finance: {
			view: { pt: "Ver o financeiro", en: "View finance" },
			receive: { pt: "Receber títulos", en: "Receive payments" },
			pay: { pt: "Pagar títulos", en: "Pay bills" },
		},
		override: {
			grant: {
				pt: "Dar liberação a quem passou do limite",
				en: "Grant overrides to those over their limit",
			},
		},
		roles: {
			manage: { pt: "Gerenciar cargos", en: "Manage roles" },
		},
		users: {
			manage: { pt: "Gerenciar usuários", en: "Manage users" },
		},
		company: {
			configure: {
				pt: "Configurar a empresa e as filiais",
				en: "Configure the company and branches",
			},
		},
	},
	created: { pt: "Cargo criado.", en: "Role created." },
	updated: { pt: "Cargo salvo.", en: "Role saved." },
	deleted: { pt: "Cargo apagado.", en: "Role deleted." },
	actionError: {
		pt: "Não foi possível apagar o cargo agora.",
		en: "Could not delete the role right now.",
	},
};
