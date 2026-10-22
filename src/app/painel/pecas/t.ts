export default {
	title: { pt: "Peças", en: "Parts" },
	nav: { pt: "Peças", en: "Parts" },
	description: {
		pt: "Catálogo da empresa: código, marca, preço de venda e os veículos em que cada peça serve.",
		en: "The company catalog: code, brand, sale price and the vehicles each part fits.",
	},
	readOnly: {
		pt: "Você pode ver as peças, mas não cadastrar nem alterar.",
		en: "You can see the parts but not add or change them.",
	},
	noAccess: {
		title: {
			pt: "Você não tem acesso a esta tela",
			en: "You do not have access to this page",
		},
		text: {
			pt: "Peça a quem administra a empresa para liberar a consulta de estoque no seu cargo.",
			en: "Ask whoever manages the company to allow stock viewing for your role.",
		},
	},
	search: {
		label: { pt: "Buscar peça", en: "Search parts" },
		placeholder: {
			pt: "Código, descrição, marca ou aplicação",
			en: "Code, description, brand or application",
		},
	},
	limited: {
		pt: "Mostrando as 200 primeiras, refine a busca.",
		en: "Showing the first 200, narrow the search.",
	},
	table: {
		code: { pt: "Código", en: "Code" },
		description: { pt: "Descrição", en: "Description" },
		brand: { pt: "Marca", en: "Brand" },
		manufacturerRef: { pt: "Ref. fabricante", en: "Manufacturer ref." },
		applications: { pt: "Aplicação", en: "Application" },
		unit: { pt: "Un.", en: "Unit" },
		price: { pt: "Preço (R$)", en: "Price (R$)" },
		status: { pt: "Situação", en: "Status" },
		actions: { pt: "Ações", en: "Actions" },
		active: { pt: "Ativa", en: "Active" },
		inactive: { pt: "Inativa", en: "Inactive" },
	},
	empty: {
		title: { pt: "Nenhuma peça ainda", en: "No parts yet" },
		text: {
			pt: "Cadastre a primeira peça com o código, a marca, o preço e os veículos em que ela serve. Uma peça com histórico não se apaga, só se inativa.",
			en: "Add the first part with its code, brand, price and the vehicles it fits. A part with history is never deleted, only deactivated.",
		},
	},
	noResults: {
		title: { pt: "Nenhuma peça encontrada", en: "No parts found" },
		text: {
			pt: "Tente outro código, marca ou modelo de veículo.",
			en: "Try another code, brand or vehicle model.",
		},
	},
	new: { pt: "Nova peça", en: "New part" },
	edit: { pt: "Editar", en: "Edit" },
	deactivate: { pt: "Inativar", en: "Deactivate" },
	reactivate: { pt: "Reativar", en: "Reactivate" },
	form: {
		newTitle: { pt: "Nova peça", en: "New part" },
		editTitle: { pt: "Editar peça", en: "Edit part" },
		code: { pt: "Código", en: "Code" },
		codeRequired: { pt: "Informe o código.", en: "Enter the code." },
		codeDuplicate: {
			pt: "Já existe peça com esse código.",
			en: "A part with this code already exists.",
		},
		description: { pt: "Descrição", en: "Description" },
		descriptionRequired: {
			pt: "Informe a descrição.",
			en: "Enter the description.",
		},
		brand: { pt: "Marca", en: "Brand" },
		brandRequired: { pt: "Informe a marca.", en: "Enter the brand." },
		manufacturerRef: {
			pt: "Ref. fabricante (opcional)",
			en: "Manufacturer ref. (optional)",
		},
		unit: { pt: "Unidade", en: "Unit" },
		units: {
			UN: { pt: "UN - unidade", en: "UN - unit" },
			PC: { pt: "PC - peça", en: "PC - piece" },
			JG: { pt: "JG - jogo", en: "JG - set" },
			KIT: { pt: "KIT - kit", en: "KIT - kit" },
			PAR: { pt: "PAR - par", en: "PAR - pair" },
			CJ: { pt: "CJ - conjunto", en: "CJ - assembly" },
		},
		ncm: { pt: "NCM (opcional)", en: "NCM (optional)" },
		ncmHelp: { pt: "8 dígitos.", en: "8 digits." },
		ncmInvalid: {
			pt: "O NCM tem 8 dígitos.",
			en: "The NCM has 8 digits.",
		},
		price: { pt: "Preço de venda (R$)", en: "Sale price (R$)" },
		priceHelp: { pt: "Exemplo: 1.234,56", en: "Example: 1.234,56" },
		priceInvalid: {
			pt: "Informe um preço válido, como 1.234,56.",
			en: "Enter a valid price, like 1.234,56.",
		},
		applications: { pt: "Aplicações", en: "Applications" },
		applicationsHelp: {
			pt: "Os veículos em que a peça serve. Deixe o eixo em Qualquer quando serve nos dois.",
			en: "The vehicles the part fits. Leave the axle on Any when it fits both.",
		},
		vehicleModel: { pt: "Modelo do veículo", en: "Vehicle model" },
		vehicleModelPlaceholder: {
			pt: "Ex.: Mercedes-Benz Atego 2426",
			en: "E.g.: Mercedes-Benz Atego 2426",
		},
		vehicleModelRequired: {
			pt: "Informe o modelo ou remova a linha.",
			en: "Enter the model or remove the row.",
		},
		axle: { pt: "Eixo", en: "Axle" },
		axles: {
			any: { pt: "Qualquer", en: "Any" },
			front: { pt: "Dianteiro", en: "Front" },
			rear: { pt: "Traseiro", en: "Rear" },
		},
		addApplication: { pt: "Adicionar aplicação", en: "Add application" },
		removeApplication: { pt: "Remover aplicação", en: "Remove application" },
		save: { pt: "Salvar", en: "Save" },
		saving: { pt: "Salvando...", en: "Saving..." },
		error: {
			pt: "Não foi possível salvar agora. Tente de novo.",
			en: "Could not save right now. Try again.",
		},
	},
	created: { pt: "Peça cadastrada.", en: "Part added." },
	updated: { pt: "Peça atualizada.", en: "Part updated." },
	deactivated: { pt: "Peça inativada.", en: "Part deactivated." },
	reactivated: { pt: "Peça reativada.", en: "Part reactivated." },
	undo: { pt: "Desfazer", en: "Undo" },
	actionError: {
		pt: "Não foi possível alterar a peça agora.",
		en: "Could not change the part right now.",
	},
};
