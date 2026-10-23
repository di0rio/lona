"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { getT } from "@/i18n/server";
import { api } from "@/lib/api";
import {
	formatDocument,
	isValidCnpj,
	isValidCpf,
	onlyDigits,
} from "@/lib/document";
import type {
	CustomerKind,
	CustomerPermissions,
	CustomerRow,
	VehicleRow,
} from "@/modules/customers";
import {
	formatPlate,
	isValidPlate,
	normalizePlate,
	STATES,
} from "@/modules/customers/validation";

export type Copy = Awaited<
	ReturnType<typeof getT>
>["t"]["app"]["painel"]["clientes"];

const selectClass =
	"h-9 w-full rounded-lg border border-border-strong bg-background px-3 text-sm shadow-[inset_0_1px_2px_oklch(0_0_0/3%)] outline-none transition-[box-shadow,border-color] duration-150 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-accent-soft disabled:opacity-50";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
export const formatMoney = (value: string) => money.format(Number(value));

/** (14) 99999-9999 ou (14) 3333-4444; o que não tem 10 nem 11 dígitos volta como veio. */
export function formatPhone(value: string) {
	return value.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
}

/** "15.000,00" ou "15000.5" vira "15000.00"; vazio vira "0"; null se não for dinheiro. */
function parseLimit(value: string) {
	const text = value.trim();
	if (!text) return "0";
	const decimal = text.includes(",")
		? text.replace(/\./g, "").replace(",", ".")
		: text;
	return /^\d+(\.\d{1,2})?$/.test(decimal) ? Number(decimal).toFixed(2) : null;
}

type Errors = Partial<Record<string, string>>;
type ServerError = { status: unknown; value: unknown };

/** 409 e 422 trazem o campo no corpo; 403 é falta de permissão. */
function serverErrors(error: ServerError, byField: Errors, copy: Copy): Errors {
	const field = (error.value as { field?: string } | null)?.field;
	if (field && byField[field]) return { [field]: byField[field] };
	return {
		form: error.status === 403 ? copy.form.denied : copy.form.error,
	};
}

const compact = (found: Errors): Errors =>
	Object.fromEntries(Object.entries(found).filter(([, message]) => message));

/** Criar (customer = null) ou editar cliente, no mesmo formulário. Na edição só vai o que mudou. */
export function CustomerForm({
	customer,
	can,
	copy,
	onDone,
}: {
	customer: CustomerRow | null;
	can: CustomerPermissions;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.form;
	const [kind, setKind] = useState<CustomerKind>(
		customer?.kind ?? "fleet_owner",
	);
	const [name, setName] = useState(customer?.name ?? "");
	const [document, setDocument] = useState(
		customer ? formatDocument(customer.document) : "",
	);
	const [phone, setPhone] = useState(customer?.phone ?? "");
	const [city, setCity] = useState(customer?.city ?? "");
	const [state, setState] = useState(customer?.state ?? "");
	const [limit, setLimit] = useState(
		customer
			? Number(customer.creditLimit).toLocaleString("pt-BR", {
					minimumFractionDigits: 2,
				})
			: "",
	);
	const [status, setStatus] = useState(customer?.status ?? "active");
	const [errors, setErrors] = useState<Errors>({});
	const [saving, setSaving] = useState(false);
	// Ao editar, o servidor exige customer.edit para tudo, menos o limite (customer.change_credit_limit).
	const fieldsLocked = customer !== null && !can.edit;
	const limitLocked = !can.changeCreditLimit;
	const isFleet = kind === "fleet_owner";

	function documentError(value: string) {
		const valid = isFleet ? isValidCnpj(value) : isValidCpf(value);
		return valid ? undefined : form.documentInvalid;
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		const phoneDigits = onlyDigits(phone);
		const creditLimit = isFleet ? parseLimit(limit) : "0";
		const found = compact({
			...(fieldsLocked
				? {}
				: {
						name: name.trim() ? undefined : form.nameRequired,
						document: documentError(document),
						phone:
							phoneDigits && ![10, 11].includes(phoneDigits.length)
								? form.phoneInvalid
								: undefined,
						city: city.trim() ? undefined : form.cityRequired,
						state: state ? undefined : form.stateRequired,
					}),
			creditLimit: creditLimit === null ? form.creditLimitInvalid : undefined,
		});
		setErrors(found);
		if (Object.keys(found).length > 0 || creditLimit === null) return;

		const values = {
			kind,
			name: name.trim(),
			document: onlyDigits(document),
			phone: phoneDigits || null,
			city: city.trim(),
			state,
			creditLimit,
			status,
		};
		setSaving(true);
		let error: ServerError | null;
		if (customer) {
			const current: Record<string, unknown> = { ...customer };
			const changed = Object.fromEntries(
				Object.entries(values).filter(
					([key, value]) =>
						current[key] !== value &&
						(key === "creditLimit" ? !limitLocked : !fieldsLocked) &&
						// "1000.00" e "1000.0" são o mesmo limite
						!(key === "creditLimit" && Number(current[key]) === Number(value)),
				),
			);
			if (Object.keys(changed).length === 0) {
				setSaving(false);
				return onDone(copy.updated);
			}
			({ error } = await api().customers({ id: customer.id }).patch(changed));
		} else {
			({ error } = await api().customers.post(values));
		}
		setSaving(false);
		if (!error) return onDone(customer ? copy.updated : copy.created);
		setErrors(
			serverErrors(
				error,
				{
					name: form.nameRequired,
					document:
						error.status === 409
							? form.documentDuplicate
							: form.documentInvalid,
					phone: form.phoneInvalid,
					city: form.cityRequired,
					state: form.stateRequired,
					// Sem o campo na tela (autônomo), o erro do limite vira a mensagem geral.
					creditLimit: isFleet ? form.creditLimitInvalid : undefined,
				},
				copy,
			),
		);
	}

	return (
		<form
			className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
			noValidate
			onSubmit={submit}
		>
			<SheetHeader className="px-0">
				<SheetTitle>{customer ? form.editTitle : form.newTitle}</SheetTitle>
			</SheetHeader>
			<fieldset className="flex flex-col gap-1.5" disabled={fieldsLocked}>
				<legend className="mb-1.5 font-medium">{form.kind}</legend>
				<RadioGroup
					className="flex gap-4"
					disabled={fieldsLocked}
					onValueChange={(value) => {
						setKind(value as CustomerKind);
						setErrors({});
					}}
					value={kind}
				>
					{(["fleet_owner", "owner_operator"] as const).map((value) => (
						<div className="flex items-center gap-2" key={value}>
							<RadioGroupItem id={`customer-kind-${value}`} value={value} />
							<label htmlFor={`customer-kind-${value}`}>
								{copy.kind[value]}
							</label>
						</div>
					))}
				</RadioGroup>
			</fieldset>
			<Field error={errors.name} id="customer-name" label={form.name}>
				<Input
					aria-describedby={errors.name ? "customer-name-error" : undefined}
					aria-invalid={Boolean(errors.name)}
					autoComplete="off"
					disabled={fieldsLocked}
					id="customer-name"
					maxLength={120}
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</Field>
			<Field
				error={errors.document}
				id="customer-document"
				label={isFleet ? form.cnpj : form.cpf}
			>
				<Input
					aria-describedby={
						errors.document ? "customer-document-error" : undefined
					}
					aria-invalid={Boolean(errors.document)}
					autoComplete="off"
					className="font-mono"
					disabled={fieldsLocked}
					id="customer-document"
					inputMode="numeric"
					maxLength={18}
					onBlur={() => {
						if (!document) return;
						const message = documentError(document);
						setErrors((prev) => compact({ ...prev, document: message }));
						if (!message) setDocument(formatDocument(document));
					}}
					onChange={(event) => setDocument(event.target.value)}
					value={document}
				/>
			</Field>
			<Field error={errors.phone} id="customer-phone" label={form.phone}>
				<Input
					aria-describedby={errors.phone ? "customer-phone-error" : undefined}
					aria-invalid={Boolean(errors.phone)}
					autoComplete="off"
					disabled={fieldsLocked}
					id="customer-phone"
					inputMode="tel"
					maxLength={20}
					onChange={(event) => setPhone(event.target.value)}
					value={phone}
				/>
			</Field>
			<div className="grid grid-cols-[1fr_6rem] gap-3">
				<Field error={errors.city} id="customer-city" label={form.city}>
					<Input
						aria-describedby={errors.city ? "customer-city-error" : undefined}
						aria-invalid={Boolean(errors.city)}
						autoComplete="off"
						disabled={fieldsLocked}
						id="customer-city"
						maxLength={80}
						onChange={(event) => setCity(event.target.value)}
						value={city}
					/>
				</Field>
				<Field error={errors.state} id="customer-state" label={form.state}>
					<select
						aria-describedby={errors.state ? "customer-state-error" : undefined}
						aria-invalid={Boolean(errors.state)}
						className={selectClass}
						disabled={fieldsLocked}
						id="customer-state"
						onChange={(event) => setState(event.target.value)}
						value={state}
					>
						<option value="" />
						{STATES.map((uf) => (
							<option key={uf} value={uf}>
								{uf}
							</option>
						))}
					</select>
				</Field>
			</div>
			{isFleet && (
				<Field
					error={errors.creditLimit}
					help={limitLocked ? form.creditLimitLocked : form.creditLimitHelp}
					id="customer-limit"
					label={form.creditLimit}
				>
					<Input
						aria-describedby={`customer-limit-help${errors.creditLimit ? " customer-limit-error" : ""}`}
						aria-invalid={Boolean(errors.creditLimit)}
						autoComplete="off"
						className="tabular-nums"
						disabled={limitLocked}
						id="customer-limit"
						inputMode="decimal"
						onChange={(event) => setLimit(event.target.value)}
						value={limit}
					/>
				</Field>
			)}
			{customer && (
				<Field id="customer-status" label={form.status}>
					<select
						className={selectClass}
						disabled={fieldsLocked}
						id="customer-status"
						onChange={(event) =>
							setStatus(event.target.value as "active" | "blocked")
						}
						value={status}
					>
						<option value="active">{copy.table.active}</option>
						<option value="blocked">{copy.table.blocked}</option>
					</select>
				</Field>
			)}
			{errors.form && (
				<p className="text-destructive text-sm" role="alert">
					{errors.form}
				</p>
			)}
			<SheetFooter className="px-0">
				<Button disabled={saving} type="submit">
					{saving ? form.saving : form.save}
				</Button>
			</SheetFooter>
		</form>
	);
}

/** Adicionar (vehicle = null) ou editar veículo de um cliente. */
export function VehicleForm({
	customerId,
	vehicle,
	copy,
	onDone,
}: {
	customerId: string;
	vehicle: VehicleRow | null;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.vehicleForm;
	const [plate, setPlate] = useState(vehicle ? formatPlate(vehicle.plate) : "");
	const [model, setModel] = useState(vehicle?.model ?? "");
	const [axles, setAxles] = useState(vehicle ? String(vehicle.axles) : "2");
	const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : "");
	const [errors, setErrors] = useState<Errors>({});
	const [saving, setSaving] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const axlesNumber = Number(axles);
		const yearNumber = year.trim() ? Number(year) : null;
		const found = compact({
			plate: isValidPlate(normalizePlate(plate))
				? undefined
				: form.plateInvalid,
			model: model.trim() ? undefined : form.modelRequired,
			axles:
				Number.isInteger(axlesNumber) && axlesNumber >= 2 && axlesNumber <= 9
					? undefined
					: form.axlesInvalid,
			year:
				yearNumber === null ||
				(Number.isInteger(yearNumber) &&
					yearNumber >= 1950 &&
					yearNumber <= 2100)
					? undefined
					: form.yearInvalid,
		});
		setErrors(found);
		if (Object.keys(found).length > 0) return;

		const input = {
			plate: normalizePlate(plate),
			model: model.trim(),
			axles: axlesNumber,
			year: yearNumber,
		};
		setSaving(true);
		const { error } = vehicle
			? await api().vehicles({ id: vehicle.id }).patch(input)
			: await api().customers({ id: customerId }).vehicles.post(input);
		setSaving(false);
		if (!error)
			return onDone(vehicle ? copy.vehicleUpdated : copy.vehicleAdded);
		setErrors(
			serverErrors(
				error,
				{
					plate: error.status === 409 ? form.plateDuplicate : form.plateInvalid,
					model: form.modelRequired,
					axles: form.axlesInvalid,
					year: form.yearInvalid,
				},
				copy,
			),
		);
	}

	return (
		<form
			className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
			noValidate
			onSubmit={submit}
		>
			<SheetHeader className="px-0">
				<SheetTitle>{vehicle ? form.editTitle : form.newTitle}</SheetTitle>
			</SheetHeader>
			<Field
				error={errors.plate}
				help={form.plateHelp}
				id="vehicle-plate"
				label={form.plate}
			>
				<Input
					aria-describedby={`vehicle-plate-help${errors.plate ? " vehicle-plate-error" : ""}`}
					aria-invalid={Boolean(errors.plate)}
					autoCapitalize="characters"
					autoComplete="off"
					className="font-mono uppercase"
					id="vehicle-plate"
					maxLength={8}
					onChange={(event) => setPlate(event.target.value)}
					value={plate}
				/>
			</Field>
			<Field error={errors.model} id="vehicle-model" label={form.model}>
				<Input
					aria-describedby={errors.model ? "vehicle-model-error" : undefined}
					aria-invalid={Boolean(errors.model)}
					autoComplete="off"
					id="vehicle-model"
					maxLength={80}
					onChange={(event) => setModel(event.target.value)}
					value={model}
				/>
			</Field>
			<div className="grid grid-cols-2 gap-3">
				<Field error={errors.axles} id="vehicle-axles" label={form.axles}>
					<Input
						aria-describedby={errors.axles ? "vehicle-axles-error" : undefined}
						aria-invalid={Boolean(errors.axles)}
						autoComplete="off"
						className="tabular-nums"
						id="vehicle-axles"
						inputMode="numeric"
						onChange={(event) => setAxles(event.target.value)}
						value={axles}
					/>
				</Field>
				<Field error={errors.year} id="vehicle-year" label={form.year}>
					<Input
						aria-describedby={errors.year ? "vehicle-year-error" : undefined}
						aria-invalid={Boolean(errors.year)}
						autoComplete="off"
						className="tabular-nums"
						id="vehicle-year"
						inputMode="numeric"
						onChange={(event) => setYear(event.target.value)}
						value={year}
					/>
				</Field>
			</div>
			{errors.form && (
				<p className="text-destructive text-sm" role="alert">
					{errors.form}
				</p>
			)}
			<SheetFooter className="px-0">
				<Button disabled={saving} type="submit">
					{saving ? copy.form.saving : copy.form.save}
				</Button>
			</SheetFooter>
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
				<p className="text-destructive text-sm" id={`${id}-error`} role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
