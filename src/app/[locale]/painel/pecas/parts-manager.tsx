"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
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
import type { PartRow } from "@/modules/inventory";
import { parsePrice } from "./price";

type Copy = {
	title: string;
	description: string;
	readOnly: string;
	search: { label: string; placeholder: string };
	limited: string;
	table: {
		code: string;
		description: string;
		brand: string;
		manufacturerRef: string;
		applications: string;
		unit: string;
		price: string;
		status: string;
		actions: string;
		active: string;
		inactive: string;
	};
	empty: { title: string; text: string };
	noResults: { title: string; text: string };
	new: string;
	edit: string;
	deactivate: string;
	reactivate: string;
	form: {
		newTitle: string;
		editTitle: string;
		code: string;
		codeRequired: string;
		codeDuplicate: string;
		description: string;
		descriptionRequired: string;
		brand: string;
		brandRequired: string;
		manufacturerRef: string;
		unit: string;
		units: Record<(typeof units)[number], string>;
		ncm: string;
		ncmHelp: string;
		ncmInvalid: string;
		price: string;
		priceHelp: string;
		priceInvalid: string;
		applications: string;
		applicationsHelp: string;
		vehicleModel: string;
		vehicleModelPlaceholder: string;
		vehicleModelRequired: string;
		axle: string;
		axles: { any: string; front: string; rear: string };
		addApplication: string;
		removeApplication: string;
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
	Record<
		| "code"
		| "description"
		| "brand"
		| "ncm"
		| "price"
		| "applications"
		| "form",
		string
	>
>;

// Espelha `units` do módulo inventory (o index dele puxa o servidor, então o cliente não importa o valor).
const units = [
	"UN",
	"PC",
	"JG",
	"KIT",
	"PAR",
	"CJ",
] as const satisfies readonly PartRow["unit"][];

const priceFormat = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** Eixo vazio na tela (Qualquer) vira null na API. */
const toAxle = (value: string): "front" | "rear" | null =>
	value === "front" || value === "rear" ? value : null;

/** "1234.50" (API) para "1.234,50" (tela). */
const showPrice = (price: string) => priceFormat.format(Number(price));

/** Lista de peças com busca na URL, criar/editar num Sheet e inativar/reativar direto na linha. */
export function PartsManager({
	parts,
	canManage,
	limited,
	query,
	copy,
}: {
	parts: PartRow[];
	canManage: boolean;
	limited: boolean;
	query: string;
	copy: Copy;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const [search, setSearch] = useState(query);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	// undefined = fechado; null = nova peça; PartRow = editando.
	const [editing, setEditing] = useState<PartRow | null | undefined>();

	useEffect(() => () => clearTimeout(timer.current), []);

	// Debounce curto: a URL (?q=) só muda quando a pessoa para de digitar, e a lista vem do servidor.
	function onSearch(value: string) {
		setSearch(value);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			const term = value.trim();
			router.replace(
				term ? `${pathname}?q=${encodeURIComponent(term)}` : pathname,
				{
					scroll: false,
				},
			);
		}, 250);
	}

	async function setActive(part: PartRow, active: boolean) {
		const { error } = await api()
			.parts({ id: part.id })
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
					await api().parts({ id: part.id }).active.patch({ active: !active });
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
			<Input
				aria-label={copy.search.label}
				autoComplete="off"
				className="max-w-md"
				onChange={(event) => onSearch(event.target.value)}
				placeholder={copy.search.placeholder}
				type="search"
				value={search}
			/>
			{parts.length === 0 ? (
				<EmptyState
					text={query ? copy.noResults.text : copy.empty.text}
					title={query ? copy.noResults.title : copy.empty.title}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{header.code}</TableHead>
							<TableHead>{header.description}</TableHead>
							<TableHead>{header.brand}</TableHead>
							<TableHead>{header.manufacturerRef}</TableHead>
							<TableHead>{header.applications}</TableHead>
							<TableHead>{header.unit}</TableHead>
							<TableHead className="text-right">{header.price}</TableHead>
							<TableHead>{header.status}</TableHead>
							{canManage && (
								<TableHead className="text-right">{header.actions}</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{parts.map((part) => (
							<TableRow
								className={part.active ? undefined : "text-muted-foreground"}
								key={part.id}
							>
								<TableCell className="font-mono text-[12.5px]">
									{part.code}
								</TableCell>
								<TableCell className="font-medium">
									{part.description}
								</TableCell>
								<TableCell>{part.brand}</TableCell>
								<TableCell className="font-mono text-[12.5px]">
									{part.manufacturerRef}
								</TableCell>
								<TableCell
									title={part.applications
										.map((a) => a.vehicleModel)
										.join(", ")}
								>
									{part.applications[0]?.vehicleModel}
									{part.applications.length > 1 && (
										<span className="ml-1.5 text-muted-foreground">
											+{part.applications.length - 1}
										</span>
									)}
								</TableCell>
								<TableCell>{part.unit}</TableCell>
								<TableCell className="text-right tabular-nums">
									{showPrice(part.salePrice)}
								</TableCell>
								<TableCell>
									{part.active ? header.active : header.inactive}
								</TableCell>
								{canManage && (
									<TableCell className="text-right">
										<Button
											onClick={() => setEditing(part)}
											size="sm"
											variant="ghost"
										>
											{copy.edit}
										</Button>
										<Button
											onClick={() => setActive(part, !part.active)}
											size="sm"
											variant="ghost"
										>
											{part.active ? copy.deactivate : copy.reactivate}
										</Button>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			{limited && (
				<p className="text-muted-foreground text-sm">{copy.limited}</p>
			)}
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent className="sm:max-w-lg">
					{editing !== undefined && (
						<PartForm
							copy={copy}
							key={editing?.id ?? "new"}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
							part={editing}
						/>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}

type ApplicationDraft = { key: number; vehicleModel: string; axle: string };

function PartForm({
	part,
	copy,
	onDone,
}: {
	part: PartRow | null;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.form;
	const nextKey = useRef(0);
	const draft = (vehicleModel: string, axle: string): ApplicationDraft => ({
		key: nextKey.current++,
		vehicleModel,
		axle,
	});
	const [code, setCode] = useState(part?.code ?? "");
	const [description, setDescription] = useState(part?.description ?? "");
	const [brand, setBrand] = useState(part?.brand ?? "");
	const [manufacturerRef, setManufacturerRef] = useState(
		part?.manufacturerRef ?? "",
	);
	const [unit, setUnit] = useState<PartRow["unit"]>(part?.unit ?? "UN");
	const [ncm, setNcm] = useState(part?.ncm ?? "");
	const [price, setPrice] = useState(
		part ? showPrice(part.salePrice).replace(/\./g, "") : "",
	);
	const [applications, setApplications] = useState<ApplicationDraft[]>(() =>
		(part?.applications ?? []).map((a) => draft(a.vehicleModel, a.axle ?? "")),
	);
	const [errors, setErrors] = useState<Errors>({});
	const [saving, setSaving] = useState(false);

	function changeApplication(key: number, change: Partial<ApplicationDraft>) {
		setApplications((rows) =>
			rows.map((row) => (row.key === key ? { ...row, ...change } : row)),
		);
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		const salePrice = parsePrice(price);
		const found: Errors = {};
		if (!code.trim()) found.code = form.codeRequired;
		if (!description.trim()) found.description = form.descriptionRequired;
		if (!brand.trim()) found.brand = form.brandRequired;
		if (ncm && ncm.length !== 8) found.ncm = form.ncmInvalid;
		if (salePrice === null) found.price = form.priceInvalid;
		if (applications.some((row) => !row.vehicleModel.trim())) {
			found.applications = form.vehicleModelRequired;
		}
		setErrors(found);
		if (salePrice === null || Object.keys(found).length > 0) return;

		const body = {
			code: code.trim(),
			description: description.trim(),
			brand: brand.trim(),
			manufacturerRef: manufacturerRef.trim() || null,
			unit,
			ncm: ncm || null,
			salePrice,
			applications: applications.map((row) => ({
				vehicleModel: row.vehicleModel.trim(),
				axle: toAxle(row.axle),
			})),
		};
		setSaving(true);
		const { error } = part
			? await api().parts({ id: part.id }).put(body)
			: await api().parts.post(body);
		setSaving(false);
		if (!error) return onDone(part ? copy.updated : copy.created);
		setErrors(
			error.status === 409
				? { code: form.codeDuplicate }
				: { form: form.error },
		);
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>{part ? form.editTitle : form.newTitle}</SheetTitle>
			</SheetHeader>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
				<Field error={errors.code} id="part-code" label={form.code}>
					<Input
						aria-describedby={errors.code ? "part-code-error" : undefined}
						aria-invalid={Boolean(errors.code)}
						autoComplete="off"
						className="font-mono"
						id="part-code"
						maxLength={40}
						onChange={(event) => setCode(event.target.value)}
						value={code}
					/>
				</Field>
				<Field
					error={errors.description}
					id="part-description"
					label={form.description}
				>
					<Input
						aria-describedby={
							errors.description ? "part-description-error" : undefined
						}
						aria-invalid={Boolean(errors.description)}
						autoComplete="off"
						id="part-description"
						maxLength={200}
						onChange={(event) => setDescription(event.target.value)}
						value={description}
					/>
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field error={errors.brand} id="part-brand" label={form.brand}>
						<Input
							aria-describedby={errors.brand ? "part-brand-error" : undefined}
							aria-invalid={Boolean(errors.brand)}
							autoComplete="off"
							id="part-brand"
							maxLength={80}
							onChange={(event) => setBrand(event.target.value)}
							value={brand}
						/>
					</Field>
					<Field id="part-ref" label={form.manufacturerRef}>
						<Input
							autoComplete="off"
							className="font-mono"
							id="part-ref"
							maxLength={60}
							onChange={(event) => setManufacturerRef(event.target.value)}
							value={manufacturerRef}
						/>
					</Field>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<Field id="part-unit" label={form.unit}>
						<NativeSelect
							id="part-unit"
							onChange={(event) =>
								setUnit(event.target.value as PartRow["unit"])
							}
							value={unit}
						>
							{units.map((value) => (
								<option key={value} value={value}>
									{form.units[value]}
								</option>
							))}
						</NativeSelect>
					</Field>
					<Field
						error={errors.price}
						help={form.priceHelp}
						id="part-price"
						label={form.price}
					>
						<Input
							aria-describedby={`part-price-help${errors.price ? " part-price-error" : ""}`}
							aria-invalid={Boolean(errors.price)}
							autoComplete="off"
							className="tabular-nums"
							id="part-price"
							inputMode="decimal"
							onChange={(event) => setPrice(event.target.value)}
							value={price}
						/>
					</Field>
				</div>
				<Field
					error={errors.ncm}
					help={form.ncmHelp}
					id="part-ncm"
					label={form.ncm}
				>
					<Input
						aria-describedby={`part-ncm-help${errors.ncm ? " part-ncm-error" : ""}`}
						aria-invalid={Boolean(errors.ncm)}
						autoComplete="off"
						className="font-mono"
						id="part-ncm"
						inputMode="numeric"
						// Aceita colado com pontos (8708.30.90) e guarda só os dígitos.
						onChange={(event) =>
							setNcm(event.target.value.replace(/\D/g, "").slice(0, 8))
						}
						value={ncm}
					/>
				</Field>
				<fieldset className="flex flex-col gap-2">
					<legend className="font-medium">{form.applications}</legend>
					<p className="text-muted-foreground text-xs">
						{form.applicationsHelp}
					</p>
					{applications.map((row, index) => (
						<div className="flex items-center gap-2" key={row.key}>
							<Input
								aria-invalid={
									Boolean(errors.applications) && !row.vehicleModel.trim()
								}
								aria-label={`${form.vehicleModel} ${index + 1}`}
								autoComplete="off"
								maxLength={120}
								onChange={(event) =>
									changeApplication(row.key, {
										vehicleModel: event.target.value,
									})
								}
								placeholder={form.vehicleModelPlaceholder}
								value={row.vehicleModel}
							/>
							<NativeSelect
								aria-label={`${form.axle} ${index + 1}`}
								className="w-36 shrink-0"
								onChange={(event) =>
									changeApplication(row.key, { axle: event.target.value })
								}
								value={row.axle}
							>
								<option value="">{form.axles.any}</option>
								<option value="front">{form.axles.front}</option>
								<option value="rear">{form.axles.rear}</option>
							</NativeSelect>
							<Button
								aria-label={`${form.removeApplication} ${index + 1}`}
								onClick={() =>
									setApplications((rows) =>
										rows.filter((r) => r.key !== row.key),
									)
								}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden />
							</Button>
						</div>
					))}
					{errors.applications && (
						<p className="text-destructive text-sm" role="alert">
							{errors.applications}
						</p>
					)}
					<Button
						className="self-start"
						onClick={() => setApplications((rows) => [...rows, draft("", "")])}
						size="sm"
						type="button"
						variant="outline"
					>
						<PlusIcon aria-hidden />
						{form.addApplication}
					</Button>
				</fieldset>
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
