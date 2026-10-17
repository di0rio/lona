export default {
	title: { pt: "Usuários", en: "Users" },
	nav: { pt: "Usuários", en: "Users" },
	description: {
		pt: "Cada pessoa tem um ou mais vínculos: um cargo, numa filial (ou em todas), para consultar ou para operar.",
		en: "Each person has one or more memberships: a role, in one branch (or all), to view or to operate.",
	},
	readOnly: {
		pt: "Só quem gerencia usuários altera vínculos. Você pode ver como estão, mas não mudar.",
		en: "Only people who manage users change memberships. You can see them but not change them.",
	},
	table: {
		name: { pt: "Nome", en: "Name" },
		email: { pt: "E-mail", en: "Email" },
		memberships: { pt: "Vínculos", en: "Memberships" },
		actions: { pt: "Ações", en: "Actions" },
	},
	empty: {
		title: { pt: "Nenhum usuário ainda", en: "No users yet" },
		text: {
			pt: "Quando alguém tiver vínculo com a empresa, aparece aqui.",
			en: "Once someone has a membership in the company, they show up here.",
		},
	},
	noEmail: { pt: "sem e-mail", en: "no email" },
	edit: { pt: "Editar vínculos", en: "Edit memberships" },
	view: { pt: "Ver vínculos", en: "View memberships" },
	membership: {
		in: { pt: "em", en: "in" },
		allBranches: { pt: "todas as filiais", en: "all branches" },
		otherBranch: { pt: "outra filial", en: "another branch" },
		inactive: { pt: "inativa", en: "inactive" },
	},
	level: {
		view: { pt: "consulta", en: "views" },
		operate: { pt: "opera", en: "operates" },
	},
	invite: {
		button: { pt: "Convidar", en: "Invite" },
		title: { pt: "Convidar pessoa", en: "Invite a person" },
		help: {
			pt: "O Lona não envia e-mail. Gere o link, copie e mande pelo WhatsApp. Quem abrir cria a conta (ou entra) e já fica com o vínculo escolhido aqui. O link vale 48 horas e funciona uma vez só.",
			en: "Lona does not send email. Generate the link, copy it and send it on WhatsApp. Whoever opens it creates an account (or signs in) and gets the membership chosen here. The link lasts 48 hours and works once.",
		},
		create: { pt: "Gerar link", en: "Generate link" },
		creating: { pt: "Gerando...", en: "Generating..." },
		linkLabel: { pt: "Link do convite", en: "Invite link" },
		copy: { pt: "Copiar link", en: "Copy link" },
		copied: { pt: "Link copiado.", en: "Link copied." },
		error: {
			pt: "Não foi possível gerar o convite agora. Tente de novo.",
			en: "Could not create the invite right now. Try again.",
		},
		pending: {
			title: { pt: "Convites pendentes", en: "Pending invites" },
			createdBy: { pt: "Criado por", en: "Created by" },
			membership: { pt: "Vínculo", en: "Membership" },
			expires: { pt: "Vence em", en: "Expires" },
			revoke: { pt: "Revogar", en: "Revoke" },
			revoked: { pt: "Convite revogado.", en: "Invite revoked." },
			error: {
				pt: "Não foi possível revogar agora. Tente de novo.",
				en: "Could not revoke right now. Try again.",
			},
		},
	},
	form: {
		title: { pt: "Vínculos de", en: "Memberships of" },
		role: { pt: "Cargo", en: "Role" },
		branch: { pt: "Filial", en: "Branch" },
		level: { pt: "Nível", en: "Level" },
		add: { pt: "Adicionar vínculo", en: "Add membership" },
		remove: { pt: "Remover vínculo", en: "Remove membership" },
		noMemberships: {
			pt: "Sem vínculos, a pessoa sai da empresa.",
			en: "With no memberships, the person leaves the company.",
		},
		save: { pt: "Salvar", en: "Save" },
		saving: { pt: "Salvando...", en: "Saving..." },
		saved: { pt: "Vínculos salvos.", en: "Memberships saved." },
		error: {
			pt: "Não foi possível salvar agora. Tente de novo.",
			en: "Could not save right now. Try again.",
		},
	},
};
