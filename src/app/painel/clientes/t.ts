export default {
	title: { pt: "Clientes", en: "Customers" },
	nav: { pt: "Clientes", en: "Customers" },
	description: {
		pt: "Frotistas e autônomos que compram de você, com os veículos de cada um.",
		en: "Fleet owners and owner-operators who buy from you, with each one's vehicles.",
	},
	new: { pt: "Novo cliente", en: "New customer" },
	search: {
		label: { pt: "Buscar cliente", en: "Search customers" },
		placeholder: {
			pt: "Nome, CPF ou CNPJ",
			en: "Name, CPF or CNPJ",
		},
	},
	noAccess: {
		title: { pt: "Sem acesso aos clientes", en: "No access to customers" },
		text: {
			pt: "Seu cargo não inclui consultar clientes. Peça a quem administra a empresa.",
			en: "Your role does not include viewing customers. Ask whoever runs the company.",
		},
	},
	empty: {
		title: { pt: "Nenhum cliente ainda", en: "No customers yet" },
		text: {
			pt: "Cadastre o primeiro frotista ou autônomo para vender a prazo e acompanhar os veículos dele.",
			en: "Add the first fleet owner or owner-operator to sell on credit and track their vehicles.",
		},
	},
	noResults: {
		title: { pt: "Nenhum cliente encontrado", en: "No customers found" },
		text: {
			pt: "Confira o nome ou o documento digitado.",
			en: "Check the name or document you typed.",
		},
	},
	truncated: {
		pt: "Mostrando os 100 primeiros. Refine a busca para achar os outros.",
		en: "Showing the first 100. Narrow the search to find the others.",
	},
	kind: {
		fleet_owner: { pt: "Frotista", en: "Fleet owner" },
		owner_operator: { pt: "Autônomo", en: "Owner-operator" },
	},
	table: {
		name: { pt: "Nome", en: "Name" },
		document: { pt: "Documento", en: "Document" },
		phone: { pt: "Telefone", en: "Phone" },
		city: { pt: "Cidade", en: "City" },
		limit: { pt: "Limite", en: "Limit" },
		vehicles: { pt: "Veículos", en: "Vehicles" },
		status: { pt: "Situação", en: "Status" },
		actions: { pt: "Ações", en: "Actions" },
		active: { pt: "Ativo", en: "Active" },
		blocked: { pt: "Bloqueado", en: "Blocked" },
	},
	form: {
		newTitle: { pt: "Novo cliente", en: "New customer" },
		editTitle: { pt: "Editar cliente", en: "Edit customer" },
		kind: { pt: "Tipo", en: "Type" },
		name: { pt: "Nome", en: "Name" },
		nameRequired: { pt: "Informe o nome.", en: "Enter the name." },
		document: { pt: "CPF ou CNPJ", en: "CPF or CNPJ" },
		cpf: { pt: "CPF", en: "CPF" },
		cnpj: { pt: "CNPJ", en: "CNPJ" },
		documentInvalid: {
			pt: "Documento inválido. Confira os dígitos.",
			en: "Invalid document. Check the digits.",
		},
		documentDuplicate: {
			pt: "Já existe um cliente com este documento.",
			en: "A customer with this document already exists.",
		},
		phone: { pt: "Telefone", en: "Phone" },
		phoneInvalid: {
			pt: "Telefone com DDD, 10 ou 11 dígitos.",
			en: "Phone with area code, 10 or 11 digits.",
		},
		city: { pt: "Cidade", en: "City" },
		cityRequired: { pt: "Informe a cidade.", en: "Enter the city." },
		state: { pt: "UF", en: "State" },
		stateRequired: { pt: "Escolha a UF.", en: "Pick the state." },
		creditLimit: { pt: "Limite de crédito", en: "Credit limit" },
		creditLimitHelp: {
			pt: "Só frotista compra a prazo. Ex.: 15.000,00",
			en: "Only fleet owners buy on credit. E.g. 15.000,00",
		},
		creditLimitInvalid: {
			pt: "Valor inválido. Ex.: 15.000,00",
			en: "Invalid amount. E.g. 15.000,00",
		},
		creditLimitLocked: {
			pt: "Seu cargo não altera o limite de crédito.",
			en: "Your role cannot change the credit limit.",
		},
		status: { pt: "Situação", en: "Status" },
		save: { pt: "Salvar", en: "Save" },
		saving: { pt: "Salvando...", en: "Saving..." },
		error: {
			pt: "Não foi possível salvar. Tente de novo.",
			en: "Could not save. Try again.",
		},
		denied: {
			pt: "Seu cargo não permite essa alteração.",
			en: "Your role does not allow this change.",
		},
	},
	vehicleForm: {
		newTitle: { pt: "Novo veículo", en: "New vehicle" },
		editTitle: { pt: "Editar veículo", en: "Edit vehicle" },
		plate: { pt: "Placa", en: "Plate" },
		plateHelp: {
			pt: "Antiga (ABC-1234) ou Mercosul (ABC1D23).",
			en: "Old (ABC-1234) or Mercosul (ABC1D23).",
		},
		plateInvalid: { pt: "Placa inválida.", en: "Invalid plate." },
		plateDuplicate: {
			pt: "Já existe um veículo com esta placa.",
			en: "A vehicle with this plate already exists.",
		},
		model: { pt: "Modelo", en: "Model" },
		modelRequired: { pt: "Informe o modelo.", en: "Enter the model." },
		axles: { pt: "Eixos", en: "Axles" },
		axlesInvalid: {
			pt: "Entre 2 e 9 eixos.",
			en: "Between 2 and 9 axles.",
		},
		year: { pt: "Ano", en: "Year" },
		yearInvalid: {
			pt: "Ano entre 1950 e 2100, ou deixe em branco.",
			en: "Year between 1950 and 2100, or leave blank.",
		},
	},
	detail: {
		back: { pt: "Voltar para clientes", en: "Back to customers" },
		edit: { pt: "Editar", en: "Edit" },
		notFound: {
			pt: "Cliente não encontrado",
			en: "Customer not found",
		},
		vehicles: { pt: "Veículos", en: "Vehicles" },
		addVehicle: { pt: "Adicionar veículo", en: "Add vehicle" },
		editVehicle: { pt: "Editar veículo", en: "Edit vehicle" },
		noVehicles: {
			pt: "Nenhum veículo cadastrado",
			en: "No vehicles registered",
		},
		noVehiclesText: {
			pt: "Cadastre a placa dos veículos para achar o cliente pelo caminhão.",
			en: "Register the vehicles' plates to find the customer by truck.",
		},
	},
	created: { pt: "Cliente cadastrado.", en: "Customer added." },
	updated: { pt: "Cliente atualizado.", en: "Customer updated." },
	vehicleAdded: { pt: "Veículo adicionado.", en: "Vehicle added." },
	vehicleUpdated: { pt: "Veículo atualizado.", en: "Vehicle updated." },
};
