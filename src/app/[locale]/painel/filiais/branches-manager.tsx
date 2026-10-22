"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
import { PageHeader } from "@/components/site-shell/page-header";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { BranchRow } from "@/modules/access";

type Copy = {
	title: string;
	description: string;
	readOnly: string;
	table: {
		name: string;
		code: string;
		cnpj: string;
		status: string;
		actions: string;
		headquarters: string;
		active: string;
		inactive: string;
	};
	empty: { title: string; text: string };
	new: string;
	edit: string;
	deactivate: string;
	reactivate: string;
	form: {
		newTitle: string;
		editTitle: string;
		name: string;
		nameRequired: string;
		code: string;
		codeHelp: string;
		codeInvalid: string;
		order: string;
		orderHelp: string;
		orderInvalid: string;
		save: string;
		saving: string;
		error: string;
	};
	created: string;
	updated: string;
	deactivated: string;
	reactivated: string;
	undo: string;
	actionError: string;
};

type Errors = Partial<Record<"name" | "code" | "order" | "form", string>>;

/** Lista de filiais com criar/editar num Dialog e inativar/reativar direto na linha. Sem permissão, só a lista. */
export function BranchesManager({
	branches,
	canConfigure,
	cnpjRoot,
	copy,
}: {
	branches: BranchRow[];
	canConfigure: boolean;
	cnpjRoot: string;
	copy: Copy;
}) {
	const router = useRouter();
	// undefined = fechado; null = nova filial; BranchRow = editando.
	const [editing, setEditing] = useState<BranchRow | null | undefined>();

	async function setActive(branch: BranchRow, active: boolean) {
		const { error } = await api()
			.access.branches({ id: branch.id })
			.patch({ active });
		if (error) {
			toast.error(copy.actionError);
			return;
		}
		router.refresh();
		toast(active ? copy.reactivated : copy.deactivated, {
			action: {
				label: copy.undo,
				onClick: async () => {
					await api()
						.access.branches({ id: branch.id })
						.patch({ active: !active });
					router.refresh();
				},
			},
		});
	}

	const header = copy.table;
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					canConfigure && (
						<Button onClick={() => setEditing(null)}>
							<PlusIcon />
							{copy.new}
						</Button>
					)
				}
				description={copy.description}
				title={copy.title}
			/>
			{!canConfigure && (
				<p className="rounded-xl bg-canvas p-3.5 text-sm">{copy.readOnly}</p>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{header.name}</TableHead>
						<TableHead>{header.code}</TableHead>
						<TableHead>{header.cnpj}</TableHead>
						<TableHead>{header.status}</TableHead>
						{canConfigure && (
							<TableHead className="text-right">{header.actions}</TableHead>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{branches.map((branch) => (
						<TableRow
							className={branch.active ? undefined : "text-muted-foreground"}
							key={branch.id}
						>
							<TableCell className="font-medium">
								{branch.name}
								{branch.isHeadquarters && (
									<span className="ml-2 rounded-full bg-canvas px-2 py-0.5 font-normal text-xs ring-1 ring-border">
										{header.headquarters}
									</span>
								)}
							</TableCell>
							<TableCell className="font-mono text-[12.5px]">
								{branch.code}
							</TableCell>
							<TableCell className="font-mono text-[12.5px]">
								{branch.cnpj}
							</TableCell>
							<TableCell>
								{branch.active ? header.active : header.inactive}
							</TableCell>
							{canConfigure && (
								<TableCell className="text-right">
									<Button
										onClick={() => setEditing(branch)}
										size="sm"
										variant="ghost"
									>
										{copy.edit}
									</Button>
									{!branch.isHeadquarters && (
										<Button
											onClick={() => setActive(branch, !branch.active)}
											size="sm"
											variant="ghost"
										>
											{branch.active ? copy.deactivate : copy.reactivate}
										</Button>
									)}
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>
			{branches.length === 1 && (
				<EmptyState text={copy.empty.text} title={copy.empty.title} />
			)}
			<Dialog
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<DialogContent>
					{editing !== undefined && (
						<BranchForm
							branch={editing}
							cnpjRoot={cnpjRoot}
							copy={copy}
							key={editing?.id ?? "new"}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
						/>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function BranchForm({
	branch,
	cnpjRoot,
	copy,
	onDone,
}: {
	branch: BranchRow | null;
	cnpjRoot: string;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.form;
	const [name, setName] = useState(branch?.name ?? "");
	const [code, setCode] = useState(branch?.code ?? "");
	const [order, setOrder] = useState(branch ? String(branch.order) : "");
	const [errors, setErrors] = useState<Errors>({});
	const [saving, setSaving] = useState(false);
	// A matriz é sempre /0001: o servidor recusa mudar a ordem dela.
	const fixedOrder = branch?.isHeadquarters ?? false;

	async function submit(event: FormEvent) {
		event.preventDefault();
		const orderNumber = Number(order);
		const found: Errors = {};
		if (!name.trim()) found.name = form.nameRequired;
		if (!/^[A-Za-z0-9]{2,6}$/.test(code.trim())) found.code = form.codeInvalid;
		if (
			!fixedOrder &&
			!(
				Number.isInteger(orderNumber) &&
				orderNumber >= 2 &&
				orderNumber <= 9999
			)
		) {
			found.order = form.orderInvalid;
		}
		setErrors(found);
		if (Object.keys(found).length > 0) return;

		setSaving(true);
		const { error } = branch
			? await api()
					.access.branches({ id: branch.id })
					.patch({ name, code, ...(fixedOrder ? {} : { order: orderNumber }) })
			: await api().access.branches.post({ name, code, order: orderNumber });
		setSaving(false);
		if (!error) return onDone(branch ? copy.updated : copy.created);
		const conflict = error.status === 409 ? error.value : null;
		if (conflict?.field) {
			setErrors({ [conflict.field]: conflict.message });
		} else {
			setErrors({ form: form.error });
		}
	}

	return (
		<form className="flex flex-col gap-4" noValidate onSubmit={submit}>
			<DialogHeader>
				<DialogTitle>{branch ? form.editTitle : form.newTitle}</DialogTitle>
			</DialogHeader>
			<Field error={errors.name} id="branch-name" label={form.name}>
				<Input
					aria-describedby={errors.name ? "branch-name-error" : undefined}
					aria-invalid={Boolean(errors.name)}
					autoComplete="off"
					id="branch-name"
					maxLength={80}
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</Field>
			<Field
				error={errors.code}
				help={form.codeHelp}
				id="branch-code"
				label={form.code}
			>
				<Input
					aria-describedby={`branch-code-help${errors.code ? " branch-code-error" : ""}`}
					aria-invalid={Boolean(errors.code)}
					autoComplete="off"
					id="branch-code"
					maxLength={6}
					onChange={(event) => setCode(event.target.value)}
					value={code}
				/>
			</Field>
			<Field
				error={errors.order}
				help={fixedOrder ? undefined : form.orderHelp}
				id="branch-order"
				label={form.order}
			>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">{cnpjRoot}/</span>
					<Input
						aria-describedby={`${fixedOrder ? "" : "branch-order-help"}${errors.order ? " branch-order-error" : ""}`}
						aria-invalid={Boolean(errors.order)}
						autoComplete="off"
						disabled={fixedOrder}
						id="branch-order"
						inputMode="numeric"
						onChange={(event) => setOrder(event.target.value)}
						value={fixedOrder ? "0001" : order}
					/>
				</div>
			</Field>
			{errors.form && (
				<p className="text-destructive text-sm" role="alert">
					{errors.form}
				</p>
			)}
			<DialogFooter>
				<Button disabled={saving} type="submit">
					{saving ? form.saving : form.save}
				</Button>
			</DialogFooter>
		</form>
	);
}

function Field({
	id,
	label,
	help,
	error,
	children,
}: {
	id: string;
	label: string;
	help?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="font-medium" htmlFor={id}>
				{label}
			</label>
			{children}
			{help && (
				<p className="text-muted-foreground text-xs" id={`${id}-help`}>
					{help}
				</p>
			)}
			{error && (
				<p className="text-destructive text-sm" id={`${id}-error`}>
					{error}
				</p>
			)}
		</div>
	);
}
