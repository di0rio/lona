export default {
	title: { pt: "Filiais", en: "Branches" },
	nav: { pt: "Filiais", en: "Branches" },
	description: {
		pt: "Cada filial tem estoque e caixa próprios. O CNPJ é a raiz da empresa mais o número de ordem da filial.",
		en: "Each branch has its own stock and cash register. The CNPJ is the company root plus the branch order number.",
	},
	readOnly: {
		pt: "Só quem configura a empresa cria e altera filiais. Você pode ver a lista, mas não mudar.",
		en: "Only people who configure the company create and change branches. You can see the list but not change it.",
	},
	off: {
		title: {
			pt: "Sua empresa trabalha só com a matriz",
			en: "Your company works with the headquarters only",
		},
		text: {
			pt: 'Ligue "Usa filiais" nas configurações para cadastrar filiais. Ligar não apaga nada: só mostra o que já existia.',
			en: 'Turn on "Uses branches" in the settings to add branches. Turning it on deletes nothing: it only shows what was already there.',
		},
		link: { pt: "Ir para Configurações", en: "Go to Settings" },
	},
	table: {
		name: { pt: "Nome", en: "Name" },
		code: { pt: "Código", en: "Code" },
		cnpj: { pt: "CNPJ", en: "CNPJ" },
		status: { pt: "Situação", en: "Status" },
		actions: { pt: "Ações", en: "Actions" },
		headquarters: { pt: "Matriz", en: "Headquarters" },
		active: { pt: "Ativa", en: "Active" },
		inactive: { pt: "Inativa", en: "Inactive" },
	},
	empty: {
		title: {
			pt: "Só a matriz por enquanto",
			en: "Only the headquarters for now",
		},
		text: {
			pt: "Abriu outra loja ou oficina? Cadastre-a como filial para ter estoque e caixa separados. Uma filial com histórico não se apaga, só se inativa.",
			en: "Opened another store or workshop? Add it as a branch to keep stock and cash separate. A branch with history is never deleted, only deactivated.",
		},
	},
	new: { pt: "Nova filial", en: "New branch" },
	edit: { pt: "Editar", en: "Edit" },
	deactivate: { pt: "Inativar", en: "Deactivate" },
	reactivate: { pt: "Reativar", en: "Reactivate" },
	form: {
		newTitle: { pt: "Nova filial", en: "New branch" },
		editTitle: { pt: "Editar filial", en: "Edit branch" },
		name: { pt: "Nome", en: "Name" },
		nameRequired: {
			pt: "Informe o nome da filial.",
			en: "Enter the branch name.",
		},
		code: { pt: "Código", en: "Code" },
		codeHelp: {
			pt: "De 2 a 6 letras ou números, como BAU.",
			en: "2 to 6 letters or numbers, like BAU.",
		},
		codeInvalid: {
			pt: "Use de 2 a 6 letras ou números.",
			en: "Use 2 to 6 letters or numbers.",
		},
		order: { pt: "Número de ordem", en: "Order number" },
		orderHelp: {
			pt: "O que vem depois da barra no CNPJ: 2 vira /0002. A matriz é sempre /0001.",
			en: "What comes after the slash in the CNPJ: 2 becomes /0002. The headquarters is always /0001.",
		},
		orderInvalid: {
			pt: "Use um número inteiro de 2 a 9999.",
			en: "Use a whole number from 2 to 9999.",
		},
		save: { pt: "Salvar", en: "Save" },
		saving: { pt: "Salvando...", en: "Saving..." },
		error: {
			pt: "Não foi possível salvar agora. Tente de novo.",
			en: "Could not save right now. Try again.",
		},
	},
	created: { pt: "Filial criada.", en: "Branch created." },
	updated: { pt: "Filial salva.", en: "Branch saved." },
	deactivated: { pt: "Filial inativada.", en: "Branch deactivated." },
	reactivated: { pt: "Filial reativada.", en: "Branch reactivated." },
	undo: { pt: "Desfazer", en: "Undo" },
	actionError: {
		pt: "Não foi possível mudar a filial agora.",
		en: "Could not change the branch right now.",
	},
};
