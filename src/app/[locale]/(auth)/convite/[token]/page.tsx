import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/site-shell/auth-shell";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { findInvite, sessionUser } from "@/modules/access";
import { AcceptButton } from "./accept-button";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.convite.title };
}

export default async function Convite({
	params,
}: PageProps<"/[locale]/convite/[token]">) {
	const { token } = await params;
	const { t, locale } = await getT();
	const copy = t.app.convite;
	const invite = await findInvite(token);

	// Vencido, usado, revogado ou inexistente: a mesma mensagem, para não dizer qual.
	if (!invite) {
		return (
			<AuthShell>
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-lg">{copy.invalid.title}</CardTitle>
						<CardDescription>{copy.invalid.text}</CardDescription>
					</CardHeader>
				</Card>
			</AuthShell>
		);
	}

	const user = await sessionUser();
	const where = invite.usesBranches
		? ` ${copy.in} ${invite.branchName ?? copy.allBranches}`
		: "";
	const query = `?convite=${encodeURIComponent(token)}`;

	return (
		<AuthShell>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-lg">
						{invite.inviterName} {copy.invited} {invite.companyName} {copy.as}{" "}
						{invite.roleName}
						{where}
					</CardTitle>
					<CardDescription>
						{!user ? copy.needAccount : user.anonymous ? copy.anonymous : null}
					</CardDescription>
				</CardHeader>
				{user && !user.anonymous ? (
					<CardContent>
						<AcceptButton
							copy={copy}
							dashboardHref={localePath(locale, "/painel")}
							token={token}
						/>
					</CardContent>
				) : (
					<CardFooter className="flex-col items-stretch gap-3">
						<Button
							nativeButton={false}
							render={<Link href={localePath(locale, `/cadastrar${query}`)} />}
						>
							{copy.register}
						</Button>
						<Button
							nativeButton={false}
							render={<Link href={localePath(locale, `/entrar${query}`)} />}
							variant="outline"
						>
							{copy.signIn}
						</Button>
					</CardFooter>
				)}
			</Card>
		</AuthShell>
	);
}
