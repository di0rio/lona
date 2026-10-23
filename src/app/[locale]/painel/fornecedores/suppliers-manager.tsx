"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
import { Field } from "@/components/site-shell/field";
import { PageHeader } from "@/components/site-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
// Direto do arquivo puro: o index do access puxa banco e auth, que não podem ir para o navegador.
import { formatCnpj, isValidCnpj } from "@/modules/access/cnpj";
import type { SupplierRow } from "@/modules/purchasing";

type Copy = {
	title: string;
	description: string;
	readOnly: string;
	table: {
		legalName: string;
		cnpj: string;
		contact: string;
		phone: string;
		city: string;
		status: string;
		actions: string;
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
		legalName: string;
		legalNameRequired: string;
		cnpj: string;
		cnpjInvalid: string;
		cnpjDuplicate: string;
		contact: string;
		phone: string;
		phoneInvalid: string;
		city: string;
		cityRequired: string;
		state: string;
		statePlaceholder: string;
		stateRequired: string;
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

type Errors = Partial<
	Record<"legalName" | "cnpj" | "phone" | "city" | "state" | "form", string>
>;

const states = [
	"AC",
	"AL",
	"AP",
	"AM",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MT",
	"MS",
	"MG",
	"PA",
	"PB",
	"PR",
	"PE",
	"PI",
	"RJ",
	"RN",
	"RS",
	"RO",
	"RR",
	"SC",
	"SP",
	"SE",
	"TO",
] as const;

/** "11912345678" para "(11) 91234-5678"; aceita 10 ou 11 dígitos e formata o que já foi digitado. */
function formatPhone(digits: string) {
	const area = digits.slice(0, 2);
	const rest = digits.slice(2);
	if (!rest) return area && `(${area}`;
	const split = digits.length > 10 ? 5 : 4;
	const head = rest.slice(0, split);
	const tail = rest.slice(split);
	return `(${area}) ${head}${tail ? `-${tail}` : ""}`;
}

/** Máscara progressiva do CNPJ alfanumérico: 12.ABC.345/01DE-35. */
function maskCnpj(text: string) {
	const d = text
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, "")
		.slice(0, 14);
	let out = d.slice(0, 2);
	if (d.length > 2) out += `.${d.slice(2, 5)}`;
	if (d.length > 5) out += `.${d.slice(5, 8)}`;
	if (d.length > 8) out += `/${d.slice(8, 12)}`;
	if (d.length > 12) out += `-${d.slice(12)}`;
	return out;
}

const onlyCnpjChars = (text: string) => text.replace(/[^0-9A-Z]/g, "");

/** Lista de fornecedores com criar/editar num Sheet e inativar/reativar direto na linha. */
export function SuppliersManager({
	suppliers,
	canManage,
	copy,
}: {
	suppliers: SupplierRow[];
	canManage: boolean;
	copy: Copy;
}) {
	const router = useRouter();
	// undefined = fechado; null = novo fornecedor; SupplierRow = editando.
	const [editing, setEditing] = useState<SupplierRow | null | undefined>();

	async function setActive(supplier: SupplierRow, active: boolean) {
		const { error } = await api()
			.suppliers({ id: supplier.id })
			.active.patch({ active });
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
						.suppliers({ id: supplier.id })
						.active.patch({ active: !active });
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
					canManage && (
						<Button onClick={() => setEditing(null)}>
							<PlusIcon />
							{copy.new}
						</Button>
					)
				}
				description={copy.description}
				title={copy.title}
			/>
			{!canManage && (
				<p className="rounded-xl bg-canvas p-3.5 text-sm">{copy.readOnly}</p>
			)}
			{suppliers.length === 0 ? (
				<EmptyState text={copy.empty.text} title={copy.empty.title} />
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{header.legalName}</TableHead>
							<TableHead>{header.cnpj}</TableHead>
							<TableHead>{header.contact}</TableHead>
							<TableHead>{header.phone}</TableHead>
							<TableHead>{header.city}</TableHead>
							<TableHead>{header.status}</TableHead>
							{canManage && (
								<TableHead className="text-right">{header.actions}</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{suppliers.map((supplier) => (
							<TableRow
								className={
									supplier.active ? undefined : "text-muted-foreground"
								}
								key={supplier.id}
							>
								<TableCell className="font-medium">
									{supplier.legalName}
								</TableCell>
								<TableCell className="font-mono text-[12.5px]">
									{formatCnpj(supplier.cnpj)}
								</TableCell>
								<TableCell>{supplier.contactName}</TableCell>
								<TableCell className="tabular-nums">
									{supplier.phone && formatPhone(supplier.phone)}
								</TableCell>
								<TableCell>
									{supplier.city}/{supplier.state}
								</TableCell>
								<TableCell>
									{supplier.active ? header.active : header.inactive}
								</TableCell>
								{canManage && (
									<TableCell className="text-right">
										<Button
											onClick={() => setEditing(supplier)}
											size="sm"
											variant="ghost"
										>
											{copy.edit}
										</Button>
										<Button
											onClick={() => setActive(supplier, !supplier.active)}
											size="sm"
											variant="ghost"
										>
											{supplier.active ? copy.deactivate : copy.reactivate}
										</Button>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent>
					{editing !== undefined && (
						<SupplierForm
							copy={copy}
							key={editing?.id ?? "new"}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
							supplier={editing}
						/>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}

function SupplierForm({
	supplier,
	copy,
	onDone,
}: {
	supplier: SupplierRow | null;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.form;
	const [legalName, setLegalName] = useState(supplier?.legalName ?? "");
	const [cnpj, setCnpj] = useState(supplier ? maskCnpj(supplier.cnpj) : "");
	const [contactName, setContactName] = useState(supplier?.contactName ?? "");
	// Só os dígitos; a tela mostra formatado.
	const [phone, setPhone] = useState(supplier?.phone ?? "");
	const [city, setCity] = useState(supplier?.city ?? "");
	const [state, setState] = useState(supplier?.state ?? "");
	const [errors, setErrors] = useState<Errors>({});
	const [saving, setSaving] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const cnpjValue = onlyCnpjChars(cnpj);
		const found: Errors = {};
		if (!legalName.trim()) found.legalName = form.legalNameRequired;
		if (!isValidCnpj(cnpjValue)) found.cnpj = form.cnpjInvalid;
		if (phone && phone.length < 10) found.phone = form.phoneInvalid;
		if (!city.trim()) found.city = form.cityRequired;
		const uf = states.find((value) => value === state);
		if (!uf) found.state = form.stateRequired;
		setErrors(found);
		if (!uf || Object.keys(found).length > 0) return;

		const body = {
			legalName: legalName.trim(),
			cnpj: cnpjValue,
			contactName: contactName.trim() || null,
			phone: phone || null,
			city: city.trim(),
			state: uf,
		};
		setSaving(true);
		const { error } = supplier
			? await api().suppliers({ id: supplier.id }).put(body)
			: await api().suppliers.post(body);
		setSaving(false);
		if (!error) return onDone(supplier ? copy.updated : copy.created);
		if (error.status === 409) setErrors({ cnpj: form.cnpjDuplicate });
		else if (error.status === 422) setErrors({ cnpj: form.cnpjInvalid });
		else setErrors({ form: form.error });
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>{supplier ? form.editTitle : form.newTitle}</SheetTitle>
			</SheetHeader>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
				<Field
					error={errors.legalName}
					id="supplier-name"
					label={form.legalName}
				>
					<Input
						aria-describedby={
							errors.legalName ? "supplier-name-error" : undefined
						}
						aria-invalid={Boolean(errors.legalName)}
						autoComplete="off"
						id="supplier-name"
						maxLength={120}
						onChange={(event) => setLegalName(event.target.value)}
						value={legalName}
					/>
				</Field>
				<Field error={errors.cnpj} id="supplier-cnpj" label={form.cnpj}>
					<Input
						aria-describedby={errors.cnpj ? "supplier-cnpj-error" : undefined}
						aria-invalid={Boolean(errors.cnpj)}
						autoComplete="off"
						className="font-mono"
						id="supplier-cnpj"
						onChange={(event) => setCnpj(maskCnpj(event.target.value))}
						value={cnpj}
					/>
				</Field>
				<Field id="supplier-contact" label={form.contact}>
					<Input
						autoComplete="off"
						id="supplier-contact"
						maxLength={80}
						onChange={(event) => setContactName(event.target.value)}
						value={contactName}
					/>
				</Field>
				<Field error={errors.phone} id="supplier-phone" label={form.phone}>
					<Input
						aria-describedby={errors.phone ? "supplier-phone-error" : undefined}
						aria-invalid={Boolean(errors.phone)}
						autoComplete="off"
						className="tabular-nums"
						id="supplier-phone"
						inputMode="tel"
						onChange={(event) =>
							setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
						}
						value={formatPhone(phone)}
					/>
				</Field>
				<div className="grid grid-cols-[1fr_6rem] gap-3">
					<Field error={errors.city} id="supplier-city" label={form.city}>
						<Input
							aria-describedby={errors.city ? "supplier-city-error" : undefined}
							aria-invalid={Boolean(errors.city)}
							autoComplete="off"
							id="supplier-city"
							maxLength={80}
							onChange={(event) => setCity(event.target.value)}
							value={city}
						/>
					</Field>
					<Field error={errors.state} id="supplier-state" label={form.state}>
						<NativeSelect
							aria-describedby={
								errors.state ? "supplier-state-error" : undefined
							}
							aria-invalid={Boolean(errors.state)}
							id="supplier-state"
							onChange={(event) => setState(event.target.value)}
							value={state}
						>
							<option value="">{form.statePlaceholder}</option>
							{states.map((uf) => (
								<option key={uf} value={uf}>
									{uf}
								</option>
							))}
						</NativeSelect>
					</Field>
				</div>
				{errors.form && (
					<p className="text-destructive text-sm" role="alert">
						{errors.form}
					</p>
				)}
			</div>
			<SheetFooter>
				<Button disabled={saving} type="submit">
					{saving ? form.saving : form.save}
				</Button>
			</SheetFooter>
		</form>
	);
}
