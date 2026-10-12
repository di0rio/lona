/** O pg trata `sslmode=require` como `verify-full` e avisa a cada processo; dizer `verify-full` tem o mesmo efeito, sem o aviso. */
export const safeUrl = (url: string) =>
	url.replace("sslmode=require", "sslmode=verify-full");
