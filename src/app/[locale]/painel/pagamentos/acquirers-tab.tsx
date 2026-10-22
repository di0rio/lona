"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
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
	AcquirerFeeRow,
	AcquirerRow,
	Modality,
	PaymentsView,
} from "@/modules/payments";
import {
	type Copy,
	dateText,
	Field,
	failure,
	pctText,
	selectClass,
} from "./shared";

type FeeLine = { modality: Modality; installments: number };

// Ordem das linhas da tabela: débito, crédito à vista, lojista de 2x a 12x e emissor.
const feeLines: FeeLine[] = [
	{ modality: "debit", installments: 1 },
	{ modality: "credit", installments: 1 },
	...Array.from({ length: 11 }, (_, i) => ({
		modality: "merchant_installments" as const,
		installments: i + 2,
	})),
	{ modality: "issuer_installments", installments: 1 },
];

const pctPattern = /^\d{1,2}(\.\d{1,2})?$/;

/** Operadoras com a tabela de taxas de cada uma. */
export function AcquirersTab({
	view,
	today,
	copy,
}: {
	view: PaymentsView;
	today: string;
	copy: Copy;
}) {
	const router = useRouter();
	// undefined = fechado; null = nova operadora; AcquirerRow = editando (ou vendo, sem permissão).
	const [editing, setEditing] = useState<AcquirerRow | null | undefined>();

	return (
		<>
			{view.canManage && (
				<div className="flex justify-end">
					<Button onClick={() => setEditing(null)}>
						<PlusIcon />
						{copy.acquirers.new}
					</Button>
				</div>
			)}
			{view.acquirers.map((acquirer) => (
				<AcquirerCard
					acquirer={acquirer}
					canManage={view.canManage}
					copy={copy}
					key={acquirer.id}
					onEdit={() => setEditing(acquirer)}
					today={today}
				/>
			))}
			{view.acquirers.length === 0 && (
				<EmptyState
					text={copy.acquirers.empty.text}
					title={copy.acquirers.empty.title}
				/>
			)}
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent className="data-[side=right]:sm:max-w-md">
					{editing !== undefined && (
						<AcquirerForm
							acquirer={editing}
							canManage={view.canManage}
							copy={copy}
							key={editing?.id ?? "new"}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
						/>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}

function AcquirerCard({
	acquirer,
	canManage,
	today,
	copy,
	onEdit,
}: {
	acquirer: AcquirerRow;
	canManage: boolean;
	today: string;
	copy: Copy;
	onEdit: () => void;
}) {
	const router = useRouter();
	const text = copy.acquirers;
	const dates = [...new Set(acquirer.fees.map((f) => f.validFrom))].sort();
	// Vigente = a data mais recente que já começou.
	const current = dates.filter((d) => d <= today).at(-1);
	const [selected, setSelected] = useState(current ?? dates.at(-1) ?? today);
	const [creating, setCreating] = useState(false);
	// A vigência escolhida pode ainda não ter taxa nenhuma (operadora nova ou data recém-criada).
	const options = [...new Set([...dates, selected])].sort().reverse();
	const rows = acquirer.fees.filter((f) => f.validFrom === selected);

	function status(date: string) {
		if (date > today) return text.validityFuture;
		if (date === current || current === undefined) return text.validityCurrent;
		return text.validityPast;
	}

	return (
		<section
			aria-label={acquirer.name}
			className="flex flex-col gap-3"
			data-acquirer={acquirer.name}
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<h2 className="font-semibold text-[15px] tracking-tight">
					{acquirer.name}
				</h2>
				{!acquirer.active && (
					<span className="rounded-full bg-canvas px-2 py-0.5 text-xs ring-1 ring-border">
						{copy.inactive}
					</span>
				)}
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<label
						className="text-muted-foreground text-sm"
						htmlFor={`validity-${acquirer.id}`}
					>
						{text.validity}
					</label>
					<select
						className={selectClass}
						id={`validity-${acquirer.id}`}
						onChange={(event) => setSelected(event.target.value)}
						value={selected}
					>
						{options.map((date) => (
							<option key={date} value={date}>
								{dateText(date)} ({status(date)})
							</option>
						))}
					</select>
					{canManage && (
						<Button
							onClick={() => setCreating(true)}
							size="sm"
							variant="outline"
						>
							{text.newValidity}
						</Button>
					)}
					<Button onClick={onEdit} size="sm" variant="ghost">
						{canManage ? copy.edit : copy.view}
					</Button>
				</div>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{text.table.modality}</TableHead>
						<TableHead className="text-right">{text.table.fee}</TableHead>
						<TableHead className="text-right">{text.table.days}</TableHead>
						<TableHead className="text-right">
							{text.table.anticipation}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{feeLines.map((line) => (
						<FeeRow
							acquirer={acquirer}
							canManage={canManage}
							copy={copy}
							fee={rows.find(
								(f) =>
									f.modality === line.modality &&
									f.installments === line.installments,
							)}
							key={`${line.modality}-${line.installments}`}
							line={line}
							validFrom={selected}
						/>
					))}
				</TableBody>
			</Table>
			<p className="text-muted-foreground text-xs">{text.daysHelp}</p>
			<Sheet onOpenChange={setCreating} open={creating}>
				<SheetContent className="data-[side=right]:sm:max-w-md">
					{creating && (
						<ValidityForm
							acquirer={acquirer}
							copy={copy}
							onDone={(date) => {
								setCreating(false);
								setSelected(date);
								router.refresh();
								toast(text.validityCreated);
							}}
							rows={rows}
						/>
					)}
				</SheetContent>
			</Sheet>
		</section>
	);
}

/** Uma linha da tabela de taxas; célula vazia cria a taxa na vigência escolhida, as outras alteram a que existe. */
function FeeRow({
	acquirer,
	line,
	fee,
	validFrom,
	canManage,
	copy,
}: {
	acquirer: AcquirerRow;
	line: FeeLine;
	fee: AcquirerFeeRow | undefined;
	validFrom: string;
	canManage: boolean;
	copy: Copy;
}) {
	const router = useRouter();
	const text = copy.acquirers;
	const label =
		line.modality === "merchant_installments"
			? `${text.modality[line.modality]} ${line.installments}x`
			: text.modality[line.modality];

	// Devolve se salvou; quem chama volta o campo ao valor anterior quando não salvou.
	async function save(
		patch: Partial<
			Pick<AcquirerFeeRow, "feePct" | "daysToReceive" | "anticipationFeePct">
		>,
	) {
		const { error } = fee
			? await api().payments.fees({ id: fee.id }).patch(patch)
			: await api().payments.fees.post({
					acquirerId: acquirer.id,
					modality: line.modality,
					installments: line.installments,
					feePct: patch.feePct ?? "0",
					daysToReceive: line.modality === "debit" ? 1 : 30,
					anticipationFeePct: null,
					validFrom,
				});
		if (error) {
			toast.error(failure(error, copy.error));
			return false;
		}
		router.refresh();
		toast(text.feeSaved);
		return true;
	}

	async function savePct(
		field: "feePct" | "anticipationFeePct",
		input: string,
	) {
		const value = input.trim().replace(",", ".");
		if (field === "anticipationFeePct" && value === "") {
			return save({ anticipationFeePct: null });
		}
		if (!pctPattern.test(value)) {
			toast.error(text.invalidPct);
			return false;
		}
		return save({ [field]: value });
	}

	async function saveDays(input: string) {
		if (!/^\d{1,3}$/.test(input.trim())) {
			toast.error(text.invalidDays);
			return false;
		}
		return save({ daysToReceive: Number(input) });
	}

	return (
		<TableRow>
			<TableCell className="font-medium">{label}</TableCell>
			<TableCell className="text-right">
				<EditableCell
					canManage={canManage}
					key={`fee-${fee?.feePct}`}
					label={`${label}: ${text.table.fee}`}
					onCommit={(value) => savePct("feePct", value)}
					suffix="%"
					value={fee ? pctText(fee.feePct) : ""}
				/>
			</TableCell>
			<TableCell className="text-right">
				<EditableCell
					canManage={canManage && Boolean(fee)}
					inputMode="numeric"
					key={`days-${fee?.daysToReceive}`}
					label={`${label}: ${text.table.days}`}
					onCommit={saveDays}
					value={fee ? String(fee.daysToReceive) : ""}
				/>
			</TableCell>
			<TableCell className="text-right">
				<EditableCell
					canManage={canManage && Boolean(fee)}
					key={`anticipation-${fee?.anticipationFeePct}`}
					label={`${label}: ${text.table.anticipation}`}
					onCommit={(value) => savePct("anticipationFeePct", value)}
					suffix={`% ${text.perMonth}`}
					value={fee?.anticipationFeePct ? pctText(fee.anticipationFeePct) : ""}
				/>
			</TableCell>
		</TableRow>
	);
}

/** Campo que salva ao sair dele (ou com Enter) quando o valor mudou; Esc desfaz. Sem permissão, só mostra o valor. */
function EditableCell({
	value,
	label,
	suffix,
	inputMode = "decimal",
	canManage,
	onCommit,
}: {
	value: string;
	label: string;
	suffix?: string;
	inputMode?: "decimal" | "numeric";
	canManage: boolean;
	onCommit: (value: string) => Promise<boolean>;
}) {
	const [text, setText] = useState(value);

	if (!canManage) {
		return (
			<span className="tabular-nums">
				{value === "" ? "-" : `${value}${suffix ? ` ${suffix}` : ""}`}
			</span>
		);
	}

	return (
		<div className="flex items-center justify-end gap-1.5">
			<Input
				aria-label={label}
				autoComplete="off"
				className="h-8 w-20 text-right tabular-nums"
				inputMode={inputMode}
				onBlur={async () => {
					if (text.trim() === value) return;
					if (!(await onCommit(text))) setText(value);
				}}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") {
						setText(value);
						event.currentTarget.blur();
					}
				}}
				placeholder="-"
				value={text}
			/>
			{suffix && (
				<span className="w-12 text-left text-muted-foreground text-xs">
					{suffix}
				</span>
			)}
		</div>
	);
}

function AcquirerForm({
	acquirer,
	canManage,
	copy,
	onDone,
}: {
	acquirer: AcquirerRow | null;
	canManage: boolean;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.acquirers.form;
	const [name, setName] = useState(acquirer?.name ?? "");
	const [active, setActive] = useState(acquirer?.active ?? true);
	const [errors, setErrors] = useState<
		Partial<Record<"name" | "form", string>>
	>({});
	const [saving, setSaving] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!name.trim()) return setErrors({ name: form.nameRequired });
		setErrors({});
		setSaving(true);
		const { error } = acquirer
			? await api()
					.payments.acquirers({ id: acquirer.id })
					.patch({ name, active })
			: await api().payments.acquirers.post({ name });
		setSaving(false);
		if (!error) {
			return onDone(acquirer ? copy.acquirers.updated : copy.acquirers.created);
		}
		setErrors({ form: failure(error, copy.error) });
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>
					{!canManage
						? form.viewTitle
						: acquirer
							? form.editTitle
							: form.newTitle}
				</SheetTitle>
			</SheetHeader>
			<fieldset
				className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4"
				disabled={!canManage}
			>
				<Field error={errors.name} id="acquirer-name" label={form.name}>
					<Input
						aria-describedby={errors.name ? "acquirer-name-error" : undefined}
						aria-invalid={Boolean(errors.name)}
						autoComplete="off"
						id="acquirer-name"
						maxLength={80}
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
				</Field>
				{acquirer && (
					<div className="flex items-center gap-2">
						<Switch
							aria-label={form.active}
							checked={active}
							onCheckedChange={setActive}
						/>
						<span>{form.active}</span>
					</div>
				)}
			</fieldset>
			{canManage && (
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

/** Nova vigência: copia as taxas da vigência que está na tela para a data escolhida. */
function ValidityForm({
	acquirer,
	rows,
	copy,
	onDone,
}: {
	acquirer: AcquirerRow;
	rows: AcquirerFeeRow[];
	copy: Copy;
	onDone: (date: string) => void;
}) {
	const text = copy.acquirers;
	const [date, setDate] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!date) return setError(text.newValidityRequired);
		setError("");
		setSaving(true);
		const results = await Promise.all(
			rows.map((fee) =>
				api().payments.fees.post({
					acquirerId: acquirer.id,
					modality: fee.modality,
					installments: fee.installments,
					feePct: fee.feePct,
					daysToReceive: fee.daysToReceive,
					anticipationFeePct: fee.anticipationFeePct,
					validFrom: date,
				}),
			),
		);
		setSaving(false);
		const failed = results.find((r) => r.error)?.error;
		if (failed) return setError(failure(failed, copy.error));
		onDone(date);
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>
					{text.newValidityTitle} - {acquirer.name}
				</SheetTitle>
			</SheetHeader>
			<div className="flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4">
				<p className="text-muted-foreground text-sm">{text.newValidityHelp}</p>
				<Field id="validity-date" label={text.newValidityDate}>
					<Input
						aria-invalid={Boolean(error)}
						id="validity-date"
						onChange={(event) => setDate(event.target.value)}
						type="date"
						value={date}
					/>
				</Field>
			</div>
			<SheetFooter>
				{error && (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				)}
				<Button disabled={saving} type="submit">
					{saving ? copy.saving : text.newValidityCreate}
				</Button>
			</SheetFooter>
		</form>
	);
}
