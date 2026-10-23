"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
import { Field } from "@/components/site-shell/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
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
	MethodKind,
	PaymentMethodRow,
	PaymentsView,
} from "@/modules/payments";
import { type Copy, failure, selectClass } from "./shared";

const kinds: MethodKind[] = [
	"cash",
	"pix",
	"debit_card",
	"credit_card",
	"bank_slip",
	"on_account",
];

const isCard = (kind: MethodKind) =>
	kind === "debit_card" || kind === "credit_card";

/** Tabela de formas; criar/editar num Sheet. O tipo só se escolhe na criação. */
export function MethodsTab({ view, copy }: { view: PaymentsView; copy: Copy }) {
	const router = useRouter();
	// undefined = fechado; null = nova forma; PaymentMethodRow = editando (ou vendo, sem permissão).
	const [editing, setEditing] = useState<PaymentMethodRow | null | undefined>();
	const header = copy.methods.table;
	const acquirerName = (id: string | null) =>
		view.acquirers.find((a) => a.id === id)?.name ?? "-";

	return (
		<>
			{view.canManage && (
				<div className="flex justify-end">
					<Button onClick={() => setEditing(null)}>
						<PlusIcon />
						{copy.methods.new}
					</Button>
				</div>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{header.name}</TableHead>
						<TableHead>{header.kind}</TableHead>
						<TableHead>{header.acquirer}</TableHead>
						<TableHead>{header.active}</TableHead>
						<TableHead className="text-right">{copy.actions}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.methods.map((method) => (
						<TableRow key={method.id}>
							<TableCell className="font-medium">{method.name}</TableCell>
							<TableCell>{copy.kind[method.kind]}</TableCell>
							<TableCell>{acquirerName(method.acquirerId)}</TableCell>
							<TableCell
								className={method.active ? "" : "text-muted-foreground"}
							>
								{method.active ? copy.active : copy.inactive}
							</TableCell>
							<TableCell className="text-right">
								<Button
									onClick={() => setEditing(method)}
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
			{view.methods.length === 0 && (
				<EmptyState
					text={copy.methods.empty.text}
					title={copy.methods.empty.title}
				/>
			)}
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent className="data-[side=right]:sm:max-w-md">
					{editing !== undefined && (
						<MethodForm
							copy={copy}
							key={editing?.id ?? "new"}
							method={editing}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
							view={view}
						/>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}

function MethodForm({
	method,
	view,
	copy,
	onDone,
}: {
	method: PaymentMethodRow | null;
	view: PaymentsView;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.methods.form;
	const [name, setName] = useState(method?.name ?? "");
	const [kind, setKind] = useState<MethodKind>(method?.kind ?? "cash");
	const [acquirerId, setAcquirerId] = useState(method?.acquirerId ?? "");
	const [active, setActive] = useState(method?.active ?? true);
	const [errors, setErrors] = useState<
		Partial<Record<"name" | "acquirer" | "form", string>>
	>({});
	const [saving, setSaving] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const found: typeof errors = {};
		if (!name.trim()) found.name = form.nameRequired;
		if (isCard(kind) && !acquirerId) found.acquirer = form.acquirerRequired;
		setErrors(found);
		if (Object.keys(found).length > 0) return;

		setSaving(true);
		const cardAcquirer = isCard(kind) ? acquirerId : null;
		const { error } = method
			? await api()
					.payments.methods({ id: method.id })
					.patch({
						name,
						active,
						...(cardAcquirer ? { acquirerId: cardAcquirer } : {}),
					})
			: await api().payments.methods.post({
					name,
					kind,
					acquirerId: cardAcquirer,
				});
		setSaving(false);
		if (!error)
			return onDone(method ? copy.methods.updated : copy.methods.created);
		setErrors({ form: failure(error, copy.error) });
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>
					{!view.canManage
						? form.viewTitle
						: method
							? form.editTitle
							: form.newTitle}
				</SheetTitle>
			</SheetHeader>
			<fieldset
				className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4"
				disabled={!view.canManage}
			>
				<Field error={errors.name} id="method-name" label={form.name}>
					<Input
						aria-describedby={errors.name ? "method-name-error" : undefined}
						aria-invalid={Boolean(errors.name)}
						autoComplete="off"
						id="method-name"
						maxLength={80}
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
				</Field>
				<Field id="method-kind" label={form.kind}>
					<select
						className={selectClass}
						disabled={Boolean(method) || !view.canManage}
						id="method-kind"
						onChange={(event) => {
							const next = kinds.find((k) => k === event.target.value);
							if (next) setKind(next);
						}}
						value={kind}
					>
						{kinds.map((k) => (
							<option key={k} value={k}>
								{copy.kind[k]}
							</option>
						))}
					</select>
				</Field>
				{isCard(kind) && (
					<Field
						error={errors.acquirer}
						id="method-acquirer"
						label={form.acquirer}
					>
						<select
							aria-invalid={Boolean(errors.acquirer)}
							className={selectClass}
							id="method-acquirer"
							onChange={(event) => setAcquirerId(event.target.value)}
							value={acquirerId}
						>
							<option value="">{form.acquirerChoose}</option>
							{view.acquirers.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
					</Field>
				)}
				{method && (
					<div className="flex items-center gap-2">
						<Switch
							disabled={!view.canManage}
							aria-label={form.active}
							checked={active}
							onCheckedChange={setActive}
						/>
						<span>{form.active}</span>
					</div>
				)}
			</fieldset>
			{view.canManage && (
				<SheetFooter>
					{errors.form && (
						<p className="text-destructive text-sm" role="alert">
							{errors.form}
						</p>
					)}
					<Button disabled={saving} type="submit">
						{saving ? copy.saving : copy.save}
					</Button>
				</SheetFooter>
			)}
		</form>
	);
}
