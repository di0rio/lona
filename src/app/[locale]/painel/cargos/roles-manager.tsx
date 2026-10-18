"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import type { Limit, Permission, RoleRow } from "@/modules/access";

type Copy = {
	readOnly: string;
	table: {
		name: string;
		members: string;
		permissions: string;
		actions: string;
		ready: string;
	};
	empty: { title: string; text: string };
	new: string;
	edit: string;
	view: string;
	delete: string;
	confirm: { title: string; text: string; cancel: string; confirm: string };
	form: {
		newTitle: string;
		editTitle: string;
		viewTitle: string;
		name: string;
		nameRequired: string;
		copyFrom: string;
		copyNone: string;
		permissions: string;
		limits: string;
		limitsHelp: string;
		noLimit: string;
		limitInvalid: string;
		save: string;
		saving: string;
		error: string;
	};
	limit: Record<Limit, { label: string; unit: string }>;
	groups: Record<string, string>;
	/** Por prefixo da permissão e depois pelo resto: `permissions.inventory.view`. */
	permissions: Record<string, Record<string, string>>;
	created: string;
	updated: string;
	deleted: string;
	actionError: string;
};

const limitKeys: Limit[] = ["max_discount_pct", "max_purchase_order"];

// Quem administra a empresa fica num grupo só; as demais permissões agrupam pelo próprio prefixo.
const adminPrefixes = ["roles", "users", "company"];
const groupOf = (permission: string) => {
	const prefix = permission.split(".")[0];
	return adminPrefixes.includes(prefix) ? "admin" : prefix;
};

const limitText = (value: number | null) =>
	value === null ? "" : String(value).replace(".", ",");

/** Lista de cargos; criar/editar num Sheet e apagar com confirmação curta. Sem roles.manage, só consulta. */
export function RolesManager({
	roles,
	permissions,
	canManage,
	copy,
}: {
	roles: RoleRow[];
	permissions: Permission[];
	canManage: boolean;
	copy: Copy;
}) {
	const router = useRouter();
	// undefined = fechado; null = novo cargo; RoleRow = editando (ou vendo, sem permissão).
	const [editing, setEditing] = useState<RoleRow | null | undefined>();
	const [deleting, setDeleting] = useState<RoleRow | undefined>();

	async function remove(role: RoleRow) {
		const { error } = await api().access.roles({ id: role.id }).delete();
		setDeleting(undefined);
		if (error) {
			toast.error(
				error.status === 409 ? error.value.message : copy.actionError,
			);
			return;
		}
		router.refresh();
		toast(copy.deleted);
	}

	const header = copy.table;
	return (
		<div className="flex flex-col gap-4">
			{canManage ? (
				<div>
					<Button onClick={() => setEditing(null)}>
						<PlusIcon />
						{copy.new}
					</Button>
				</div>
			) : (
				<p className="rounded-lg border bg-muted p-3 text-sm">
					{copy.readOnly}
				</p>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{header.name}</TableHead>
						<TableHead>{header.members}</TableHead>
						<TableHead>{header.permissions}</TableHead>
						<TableHead className="text-right">{header.actions}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{roles.map((role) => (
						<TableRow key={role.id}>
							<TableCell className="font-medium">
								{role.name}
								{role.isPreset && (
									<span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-normal text-xs">
										{header.ready}
									</span>
								)}
							</TableCell>
							<TableCell>{role.members}</TableCell>
							<TableCell>
								{role.permissions.length}/{permissions.length}
							</TableCell>
							<TableCell className="text-right">
								<Button
									onClick={() => setEditing(role)}
									size="sm"
									variant="ghost"
								>
									{canManage ? copy.edit : copy.view}
								</Button>
								{canManage && !role.isPreset && (
									<Button
										onClick={() => setDeleting(role)}
										size="sm"
										variant="ghost"
									>
										{copy.delete}
									</Button>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{roles.length === 0 && (
				<div className="flex flex-col gap-1 rounded-lg border border-dashed p-4">
					<p className="font-medium">{copy.empty.title}</p>
					<p className="text-muted-foreground text-sm">{copy.empty.text}</p>
				</div>
			)}
			<Sheet
				onOpenChange={(open) => !open && setEditing(undefined)}
				open={editing !== undefined}
			>
				<SheetContent className="data-[side=right]:sm:max-w-lg">
					{editing !== undefined && (
						<RoleForm
							canManage={canManage}
							copy={copy}
							key={editing?.id ?? "new"}
							onDone={(message) => {
								setEditing(undefined);
								router.refresh();
								toast(message);
							}}
							permissions={permissions}
							role={editing}
							roles={roles}
						/>
					)}
				</SheetContent>
			</Sheet>
			<Dialog
				onOpenChange={(open) => !open && setDeleting(undefined)}
				open={deleting !== undefined}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{copy.confirm.title}</DialogTitle>
						<DialogDescription>
							{deleting?.name}. {copy.confirm.text}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setDeleting(undefined)} variant="outline">
							{copy.confirm.cancel}
						</Button>
						<Button
							onClick={() => deleting && remove(deleting)}
							variant="destructive"
						>
							{copy.confirm.confirm}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function RoleForm({
	role,
	roles,
	permissions,
	canManage,
	copy,
	onDone,
}: {
	role: RoleRow | null;
	roles: RoleRow[];
	permissions: Permission[];
	canManage: boolean;
	copy: Copy;
	onDone: (message: string) => void;
}) {
	const form = copy.form;
	const [name, setName] = useState(role?.name ?? "");
	const [granted, setGranted] = useState<Permission[]>(role?.permissions ?? []);
	const [limits, setLimits] = useState<Record<Limit, string>>({
		max_discount_pct: limitText(role?.limits.max_discount_pct ?? 0),
		max_purchase_order: limitText(role?.limits.max_purchase_order ?? 0),
	});
	const [errors, setErrors] = useState<
		Partial<Record<"name" | Limit | "form", string>>
	>({});
	const [saving, setSaving] = useState(false);

	// Cargo novo pode partir de uma cópia: só preenche a tela, nada é salvo até "Salvar".
	function copyFrom(id: string) {
		const source = roles.find((r) => r.id === id);
		setGranted(source?.permissions ?? []);
		setLimits({
			max_discount_pct: limitText(source?.limits.max_discount_pct ?? 0),
			max_purchase_order: limitText(source?.limits.max_purchase_order ?? 0),
		});
	}

	const groups = [...new Set(permissions.map(groupOf))];

	async function submit(event: FormEvent) {
		event.preventDefault();
		const found: typeof errors = {};
		if (!name.trim()) found.name = form.nameRequired;
		const parsed = {} as Record<Limit, number | null>;
		for (const key of limitKeys) {
			const text = limits[key].trim();
			const value = text === "" ? null : Number(text.replace(",", "."));
			if (value !== null && !(Number.isFinite(value) && value >= 0)) {
				found[key] = form.limitInvalid;
			}
			parsed[key] = value;
		}
		setErrors(found);
		if (Object.keys(found).length > 0) return;

		const body = { name, permissions: granted, limits: parsed };
		setSaving(true);
		const { error } = role
			? await api().access.roles({ id: role.id }).put(body)
			: await api().access.roles.post(body);
		setSaving(false);
		if (!error) return onDone(role ? copy.updated : copy.created);
		const conflict = error.status === 409 ? error.value : null;
		if (!conflict) setErrors({ form: form.error });
		else if (conflict.field === "name") setErrors({ name: conflict.message });
		else setErrors({ form: conflict.message });
	}

	return (
		<form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
			<SheetHeader>
				<SheetTitle>
					{!canManage ? form.viewTitle : role ? form.editTitle : form.newTitle}
				</SheetTitle>
			</SheetHeader>
			<fieldset
				className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4"
				disabled={!canManage}
			>
				<div className="flex flex-col gap-1.5">
					<label className="font-medium" htmlFor="role-name">
						{form.name}
					</label>
					<Input
						aria-describedby={errors.name ? "role-name-error" : undefined}
						aria-invalid={Boolean(errors.name)}
						autoComplete="off"
						id="role-name"
						maxLength={80}
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
					{errors.name && (
						<p className="text-destructive text-sm" id="role-name-error">
							{errors.name}
						</p>
					)}
				</div>
				{!role && (
					<div className="flex flex-col gap-1.5">
						<label className="font-medium" htmlFor="role-copy">
							{form.copyFrom}
						</label>
						<select
							className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
							defaultValue=""
							id="role-copy"
							onChange={(event) => copyFrom(event.target.value)}
						>
							<option value="">{form.copyNone}</option>
							{roles.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
						</select>
					</div>
				)}
				<div className="flex flex-col gap-3">
					<h3 className="font-medium">{form.limits}</h3>
					<p className="text-muted-foreground text-xs">{form.limitsHelp}</p>
					{limitKeys.map((key) => (
						<div className="flex flex-col gap-1.5" key={key}>
							<label className="text-sm" htmlFor={`limit-${key}`}>
								{copy.limit[key].label}
							</label>
							<div className="flex items-center gap-2">
								<span className="w-6 text-muted-foreground text-sm">
									{copy.limit[key].unit}
								</span>
								<Input
									aria-invalid={Boolean(errors[key])}
									autoComplete="off"
									id={`limit-${key}`}
									inputMode="decimal"
									onChange={(event) =>
										setLimits({ ...limits, [key]: event.target.value })
									}
									placeholder={form.noLimit}
									value={limits[key]}
								/>
							</div>
							{errors[key] && (
								<p className="text-destructive text-sm">{errors[key]}</p>
							)}
						</div>
					))}
				</div>
				<div className="flex flex-col gap-4">
					<h3 className="font-medium">{form.permissions}</h3>
					{groups.map((group) => (
						<fieldset className="flex flex-col gap-2" key={group}>
							<legend className="mb-1 font-medium text-muted-foreground text-sm">
								{copy.groups[group]}
							</legend>
							{permissions
								.filter((p) => groupOf(p) === group)
								.map((permission) => {
									const [prefix, action] = permission.split(".");
									return (
										<label
											className="flex items-center gap-2 text-sm"
											key={permission}
										>
											<input
												checked={granted.includes(permission)}
												className="size-4 accent-primary"
												onChange={(event) =>
													setGranted(
														event.target.checked
															? [...granted, permission]
															: granted.filter((p) => p !== permission),
													)
												}
												type="checkbox"
											/>
											{copy.permissions[prefix][action]}
										</label>
									);
								})}
						</fieldset>
					))}
				</div>
			</fieldset>
			{canManage && (
				<SheetFooter>
					{errors.form && (
						<p className="text-destructive text-sm" role="alert">
							{errors.form}
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
