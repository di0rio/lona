"use client";

import { PlusIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
import { InitialsAvatar } from "@/components/site-shell/initials-avatar";
import { PageHeader } from "@/components/site-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type {
	InviteRow,
	Level,
	MembershipInput,
	MembershipRow,
	UserRow,
	UsersView,
} from "@/modules/access";

type Copy = {
	title: string;
	description: string;
	readOnly: string;
	table: { name: string; email: string; memberships: string; actions: string };
	empty: { title: string; text: string };
	noEmail: string;
	edit: string;
	view: string;
	membership: {
		in: string;
		allBranches: string;
		otherBranch: string;
		inactive: string;
	};
	level: Record<Level, string>;
	invite: {
		button: string;
		title: string;
		help: string;
		create: string;
		creating: string;
		linkLabel: string;
		copy: string;
		copied: string;
		error: string;
		pending: {
			title: string;
			createdBy: string;
			membership: string;
			expires: string;
			revoke: string;
			revoked: string;
			error: string;
		};
	};
	form: {
		title: string;
		role: string;
		branch: string;
		level: string;
		add: string;
		remove: string;
		noMemberships: string;
		save: string;
		saving: string;
		saved: string;
		error: string;
	};
};

const selectClass =
	"h-9 w-full rounded-lg border border-border-strong bg-background px-3 text-sm shadow-[inset_0_1px_2px_oklch(0_0_0/3%)] outline-none transition-[box-shadow,border-color] duration-150 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-accent-soft";

/** Lista de usuários da empresa; os vínculos de cada um se editam num Sheet. Sem users.manage, só consulta. */
export function UsersManager({ view, copy }: { view: UsersView; copy: Copy }) {
	const router = useRouter();
	const [editing, setEditing] = useState<UserRow | undefined>();
	const [inviting, setInviting] = useState(false);

	// Sem filiais ligadas o vínculo é sempre "todas" e a filial nem aparece (ADR 0003).
	const describe = (
		m: Pick<MembershipRow, "branchId" | "branchName" | "roleName" | "level">,
	) => {
		const where = !view.usesBranches
			? ""
			: ` ${copy.membership.in} ${
					m.branchId === null
						? copy.membership.allBranches
						: (m.branchName ?? copy.membership.otherBranch)
				}`;
		return `${m.roleName}${where} · ${copy.level[m.level]}`;
	};

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					view.canManage && (
						<Button onClick={() => setInviting(true)}>
							<UserPlusIcon />
							{copy.invite.button}
						</Button>
					)
				}
				description={copy.description}
				title={copy.title}
			/>
			{!view.canManage && (
				<p className="rounded-xl bg-canvas p-3.5 text-sm">{copy.readOnly}</p>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{copy.table.name}</TableHead>
						<TableHead>{copy.table.email}</TableHead>
						<TableHead>{copy.table.memberships}</TableHead>
						<TableHead className="text-right">{copy.table.actions}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.users.map((user) => (
						<TableRow key={user.id}>
							<TableCell className="font-medium">
								<div className="flex items-center gap-3">
									<InitialsAvatar name={user.name} />
									{user.name}
								</div>
							</TableCell>
							<TableCell className="text-muted-foreground">
								<span
									className="block max-w-72 truncate"
									title={user.email ?? undefined}
								>
									{user.email ?? copy.noEmail}
								</span>
							</TableCell>
							<TableCell>
								<ul className="flex flex-wrap gap-1.5">
									{user.memberships.map((m) => (
										<li
											className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 font-medium text-[12.5px] ring-1 ring-border"
											key={m.branchId ?? "all"}
										>
											{/* Ponto cheio = opera; vazado = só consulta. */}
											<span
												aria-hidden="true"
												className={
													m.level === "operate"
														? "size-1.5 rounded-full bg-primary"
														: "size-1.5 rounded-full ring-[1.5px] ring-muted-foreground ring-inset"
												}
											/>
											{describe(m)}
										</li>
									))}
								</ul>
							</TableCell>
							<TableCell className="text-right">
								<Button
									onClick={() => setEditing(user)}
									size="sm"
									variant="ghost"
								>
									{view.canManage ? copy.edit : copy.view}
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{view.users.length === 0 && (
				<EmptyState text={copy.empty.text} title={copy.empty.title} />
			)}
			{view.invites.length > 0 && (
				<PendingInvites
					copy={copy}
					describe={describe}
					invites={view.invites}
				/>
			)}
			<Sheet onOpenChange={setInviting} open={inviting}>
				<SheetContent className="data-[side=right]:sm:max-w-lg">
					{inviting && (
						<InviteForm
							copy={copy}
							onCreated={() => router.refresh()}
							view={view}
						/>
					)}
				</SheetContent>
			</Sheet>
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent className="data-[side=right]:sm:max-w-lg">
					{editing && (
						<MembershipsForm
							copy={copy}
							key={editing.id}
							onDone={() => {
								setEditing(undefined);
								router.refresh();
								toast(copy.form.saved);
							}}
							user={editing}
							view={view}
						/>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}

type Row = MembershipInput & { key: number };

function MembershipsForm({
	user,
	view,
	copy,
	onDone,
}: {
	user: UserRow;
	view: UsersView;
	copy: Copy;
	onDone: () => void;
}) {
	const form = copy.form;
	const nextKey = useRef(user.memberships.length);
	const [rows, setRows] = useState<Row[]>(
		user.memberships.map(({ branchId, roleId, level }, key) => ({
			key,
			branchId,
			roleId,
			level,
		})),
	);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const { canManage } = view;
	// Filial inativa só aparece onde o vínculo já existe: vínculo novo nela o servidor recusa.
	const hadBranch = (id: string) =>
		user.memberships.some((m) => m.branchId === id);

	const change = (key: number, patch: Partial<MembershipInput>) =>
		setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

	function add() {
		const first = view.roles[0];
		if (!first) return;
		setRows([
			...rows,
			{
				key: nextKey.current++,
				// Com filiais ligadas o padrão é a primeira filial ainda sem vínculo; senão "todas".
				branchId: view.usesBranches
					? (view.branches.find(
							(b) => b.active && !rows.some((r) => r.branchId === b.id),
						)?.id ?? null)
					: null,
				roleId: first.id,
				level: "operate",
			},
		]);
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		setSaving(true);
		setError("");
		const { error: failed } = await api()
			.access.users({ id: user.id })
			.memberships.put({
				memberships: rows.map(({ branchId, roleId, level }) => ({
					branchId: view.usesBranches ? branchId : null,
					roleId,
					level,
				})),
			});
		setSaving(false);
		if (!failed) return onDone();
		setError(failed.status === 409 ? failed.value.message : form.error);
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>
					{form.title} {user.name}
				</SheetTitle>
			</SheetHeader>
			<fieldset
				className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
				disabled={!canManage}
			>
				{rows.map((row) => (
					<div
						className="flex flex-col gap-3 rounded-xl border p-3"
						key={row.key}
					>
						<div className="flex flex-col gap-1.5">
							<label className="text-sm" htmlFor={`membership-role-${row.key}`}>
								{form.role}
							</label>
							<select
								className={selectClass}
								id={`membership-role-${row.key}`}
								onChange={(event) =>
									change(row.key, { roleId: event.target.value })
								}
								value={row.roleId}
							>
								{view.roles.map((role) => (
									<option key={role.id} value={role.id}>
										{role.name}
									</option>
								))}
							</select>
						</div>
						{view.usesBranches && (
							<div className="flex flex-col gap-1.5">
								<label
									className="text-sm"
									htmlFor={`membership-branch-${row.key}`}
								>
									{form.branch}
								</label>
								<select
									className={selectClass}
									id={`membership-branch-${row.key}`}
									onChange={(event) =>
										change(row.key, { branchId: event.target.value || null })
									}
									value={row.branchId ?? ""}
								>
									<option value="">{copy.membership.allBranches}</option>
									{view.branches.map((branch) => (
										<option
											disabled={!branch.active && !hadBranch(branch.id)}
											key={branch.id}
											value={branch.id}
										>
											{branch.name}
											{!branch.active && ` (${copy.membership.inactive})`}
										</option>
									))}
								</select>
							</div>
						)}
						<div className="flex items-end gap-2">
							<div className="flex flex-1 flex-col gap-1.5">
								<label
									className="text-sm"
									htmlFor={`membership-level-${row.key}`}
								>
									{form.level}
								</label>
								<select
									className={selectClass}
									id={`membership-level-${row.key}`}
									onChange={(event) =>
										change(row.key, { level: event.target.value as Level })
									}
									value={row.level}
								>
									<option value="view">{copy.level.view}</option>
									<option value="operate">{copy.level.operate}</option>
								</select>
							</div>
							<Button
								aria-label={form.remove}
								onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
								size="icon"
								title={form.remove}
								type="button"
								variant="ghost"
							>
								<Trash2Icon />
							</Button>
						</div>
					</div>
				))}
				{rows.length === 0 && (
					<p className="rounded-xl border border-dashed p-3 text-sm">
						{form.noMemberships}
					</p>
				)}
				<div>
					<Button onClick={add} type="button" variant="outline">
						<PlusIcon />
						{form.add}
					</Button>
				</div>
			</fieldset>
			{canManage && (
				<SheetFooter>
					{error && (
						<p className="text-destructive text-sm" role="alert">
							{error}
						</p>
					)}
					<Button disabled={saving} type="submit">
						{saving ? form.saving : form.save}
					</Button>
				</SheetFooter>
			)}
		</form>
	);
}

function PendingInvites({
	invites,
	copy,
	describe,
}: {
	invites: InviteRow[];
	copy: Copy;
	describe: (m: InviteRow) => string;
}) {
	const router = useRouter();
	const text = copy.invite.pending;

	async function revoke(id: string) {
		const { error } = await api().access.invites({ id }).delete();
		if (error) return toast(text.error);
		router.refresh();
		toast(text.revoked);
	}

	return (
		<div className="flex flex-col gap-2">
			<h2 className="font-medium">{text.title}</h2>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{text.createdBy}</TableHead>
						<TableHead>{text.membership}</TableHead>
						<TableHead>{text.expires}</TableHead>
						<TableHead className="text-right">{copy.table.actions}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{invites.map((invite) => (
						<TableRow key={invite.id}>
							<TableCell>{invite.createdByName}</TableCell>
							<TableCell>{describe(invite)}</TableCell>
							<TableCell>
								{/* Fuso e idioma do navegador: o servidor pode renderizar diferente. */}
								<time
									dateTime={new Date(invite.expiresAt).toISOString()}
									suppressHydrationWarning
								>
									{new Date(invite.expiresAt).toLocaleString(undefined, {
										dateStyle: "short",
										timeStyle: "short",
									})}
								</time>
							</TableCell>
							<TableCell className="text-right">
								<Button
									onClick={() => revoke(invite.id)}
									size="sm"
									variant="ghost"
								>
									{text.revoke}
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function InviteForm({
	view,
	copy,
	onCreated,
}: {
	view: UsersView;
	copy: Copy;
	onCreated: () => void;
}) {
	const invite = copy.invite;
	const [roleId, setRoleId] = useState(view.roles[0]?.id ?? "");
	const [branchId, setBranchId] = useState<string | null>(null);
	const [level, setLevel] = useState<Level>("operate");
	const [link, setLink] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		setSaving(true);
		setError("");
		const { data, error: failed } = await api().access.invites.post({
			branchId: view.usesBranches ? branchId : null,
			roleId,
			level,
		});
		setSaving(false);
		if (failed) {
			return setError(
				failed.status === 409 ? failed.value.message : invite.error,
			);
		}
		setLink(`${window.location.origin}/convite/${data.token}`);
		onCreated();
	}

	async function copyLink() {
		await navigator.clipboard.writeText(link);
		toast(invite.copied);
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>{invite.title}</SheetTitle>
			</SheetHeader>
			<fieldset
				className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
				disabled={link !== ""}
			>
				<p className="text-muted-foreground text-sm">{invite.help}</p>
				<div className="flex flex-col gap-1.5">
					<label className="text-sm" htmlFor="invite-role">
						{copy.form.role}
					</label>
					<select
						className={selectClass}
						id="invite-role"
						onChange={(event) => setRoleId(event.target.value)}
						value={roleId}
					>
						{view.roles.map((role) => (
							<option key={role.id} value={role.id}>
								{role.name}
							</option>
						))}
					</select>
				</div>
				{view.usesBranches && (
					<div className="flex flex-col gap-1.5">
						<label className="text-sm" htmlFor="invite-branch">
							{copy.form.branch}
						</label>
						<select
							className={selectClass}
							id="invite-branch"
							onChange={(event) => setBranchId(event.target.value || null)}
							value={branchId ?? ""}
						>
							<option value="">{copy.membership.allBranches}</option>
							{view.branches
								.filter((branch) => branch.active)
								.map((branch) => (
									<option key={branch.id} value={branch.id}>
										{branch.name}
									</option>
								))}
						</select>
					</div>
				)}
				<div className="flex flex-col gap-1.5">
					<label className="text-sm" htmlFor="invite-level">
						{copy.form.level}
					</label>
					<select
						className={selectClass}
						id="invite-level"
						onChange={(event) => setLevel(event.target.value as Level)}
						value={level}
					>
						<option value="view">{copy.level.view}</option>
						<option value="operate">{copy.level.operate}</option>
					</select>
				</div>
			</fieldset>
			<SheetFooter>
				{error && (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				)}
				{link ? (
					<div className="flex gap-2">
						<Input
							aria-label={invite.linkLabel}
							onFocus={(event) => event.currentTarget.select()}
							readOnly
							value={link}
						/>
						<Button onClick={copyLink} type="button">
							{invite.copy}
						</Button>
					</div>
				) : (
					<Button disabled={saving || roleId === ""} type="submit">
						{saving ? invite.creating : invite.create}
					</Button>
				)}
			</SheetFooter>
		</form>
	);
}
