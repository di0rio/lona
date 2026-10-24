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
import type { PaymentsView, PaymentTermRow } from "@/modules/payments";
import { type Copy, failure, selectClass } from "./shared";

/** "30/60, 90" -> [30, 60, 90]; null se algum item não for um número inteiro de dias. */
function parseDays(text: string) {
	const parts = text.split(/[\s,;/]+/).filter(Boolean);
	if (parts.length === 0 || parts.some((p) => !/^\d{1,3}$/.test(p))) {
		return null;
	}
	return parts.map(Number);
}

/** Tabela de condições; criar/editar num Sheet. A forma só se escolhe na criação. */
export function TermsTab({ view, copy }: { view: PaymentsView; copy: Copy }) {
	const router = useRouter();
	// undefined = fechado; null = nova condição; PaymentTermRow = editando (ou vendo, sem permissão).
	const [editing, setEditing] = useState<PaymentTermRow | null | undefined>();
	const header = copy.terms.table;
	const methodOf = (id: string) => view.methods.find((m) => m.id === id);

	// Cartão mostra só o número de parcelas (o recebimento vem da taxa); os demais mostram os dias.
	function installmentsText(term: PaymentTermRow) {
		const days = term.installmentDays;
		const kind = methodOf(term.paymentMethodId)?.kind;
		if (kind === "debit_card" || kind === "credit_card") {
			if (days.length === 1) return copy.terms.cash;
			const issuer = term.issuerInstallments ? ` ${copy.terms.issuer}` : "";
			return `${days.length}x${issuer}`;
		}
		return days.length === 1 && days[0] === 0
			? copy.terms.cash
			: days.join("/");
	}

	return (
		<>
			{view.canManage && (
				<div className="flex justify-end">
					<Button onClick={() => setEditing(null)}>
						<PlusIcon />
						{copy.terms.new}
					</Button>
				</div>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{header.name}</TableHead>
						<TableHead>{header.method}</TableHead>
						<TableHead>{header.installments}</TableHead>
						<TableHead>{header.active}</TableHead>
						<TableHead className="text-right">{copy.actions}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.terms.map((term) => (
						<TableRow key={term.id}>
							<TableCell className="font-medium">{term.name}</TableCell>
							<TableCell>
								{methodOf(term.paymentMethodId)?.name ?? "-"}
							</TableCell>
							<TableCell className="tabular-nums">
								{installmentsText(term)}
							</TableCell>
							<TableCell className={term.active ? "" : "text-muted-foreground"}>
								{term.active ? copy.active : copy.inactive}
							</TableCell>
							<TableCell className="text-right">
								<Button
									onClick={() => setEditing(term)}
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
			{view.terms.length === 0 && (
				<EmptyState
					text={copy.terms.empty.text}
					title={copy.terms.empty.title}
				/>
			)}
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent className="data-[side=right]:sm:max-w-md">
					{editing !== undefined && (
						<TermForm
							copy={copy}
							key={editing?.id ?? "new"}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
							term={editing}
							view={view}
						/>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}

function TermForm({
	term,
	view,
	copy,
	onDone,
}: {
	term: PaymentTermRow | null;
	view: PaymentsView;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.terms.form;
	const [name, setName] = useState(term?.name ?? "");
	const [methodId, setMethodId] = useState(term?.paymentMethodId ?? "");
	const [daysText, setDaysText] = useState(
		term?.installmentDays.join("/") ?? "0",
	);
	const [issuer, setIssuer] = useState(term?.issuerInstallments ?? false);
	const [active, setActive] = useState(term?.active ?? true);
	const [errors, setErrors] = useState<
		Partial<Record<"name" | "method" | "days" | "form", string>>
	>({});
	const [saving, setSaving] = useState(false);

	// Na criação só entram formas ativas; na edição a forma da condição não muda.
	const methods = term ? view.methods : view.methods.filter((m) => m.active);
	const days = parseDays(daysText);
	const kind = view.methods.find((m) => m.id === methodId)?.kind;
	// Parcelado emissor só existe no crédito com mais de uma parcela.
	const canIssuer = kind === "credit_card" && (days?.length ?? 0) > 1;

	async function submit(event: FormEvent) {
		event.preventDefault();
		const found: typeof errors = {};
		if (!name.trim()) found.name = form.nameRequired;
		if (!methodId) found.method = form.methodRequired;
		if (
			!days ||
			days.length > 12 ||
			days.some((d, i) => i > 0 && d < days[i - 1])
		) {
			found.days = form.daysInvalid;
		}
		setErrors(found);
		if (!days || Object.keys(found).length > 0) return;

		const issuerInstallments = canIssuer && issuer;
		setSaving(true);
		const { error } = term
			? await api().payments.terms({ id: term.id }).patch({
					name,
					installmentDays: days,
					issuerInstallments,
					active,
				})
			: await api().payments.terms.post({
					name,
					paymentMethodId: methodId,
					installmentDays: days,
					issuerInstallments,
				});
		setSaving(false);
		if (!error) return onDone(term ? copy.terms.updated : copy.terms.created);
		setErrors({ form: failure(error, copy.error) });
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>
					{!view.canManage
						? form.viewTitle
						: term
							? form.editTitle
							: form.newTitle}
				</SheetTitle>
			</SheetHeader>
			<fieldset
				className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4"
				disabled={!view.canManage}
			>
				<Field error={errors.name} id="term-name" label={form.name}>
					<Input
						aria-describedby={errors.name ? "term-name-error" : undefined}
						aria-invalid={Boolean(errors.name)}
						autoComplete="off"
						id="term-name"
						maxLength={80}
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
				</Field>
				<Field error={errors.method} id="term-method" label={form.method}>
					<select
						aria-invalid={Boolean(errors.method)}
						className={selectClass}
						disabled={Boolean(term) || !view.canManage}
						id="term-method"
						onChange={(event) => setMethodId(event.target.value)}
						value={methodId}
					>
						<option value="">{form.methodChoose}</option>
						{methods.map((m) => (
							<option key={m.id} value={m.id}>
								{m.name}
							</option>
						))}
					</select>
				</Field>
				<Field
					error={errors.days}
					help={form.daysHelp}
					id="term-days"
					label={form.days}
				>
					<Input
						aria-describedby={errors.days ? "term-days-error" : undefined}
						aria-invalid={Boolean(errors.days)}
						autoComplete="off"
						className="tabular-nums"
						id="term-days"
						inputMode="numeric"
						onChange={(event) => setDaysText(event.target.value)}
						value={daysText}
					/>
				</Field>
				{canIssuer && (
					<div className="flex items-start gap-2">
						<Switch
							disabled={!view.canManage}
							aria-label={form.issuer}
							checked={issuer}
							onCheckedChange={setIssuer}
						/>
						<div className="flex flex-col">
							<span>{form.issuer}</span>
							<span className="text-muted-foreground text-xs">
								{form.issuerHelp}
							</span>
						</div>
					</div>
				)}
				{term && (
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
