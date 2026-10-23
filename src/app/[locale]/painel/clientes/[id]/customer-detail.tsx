"use client";

import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
import { PageHeader } from "@/components/site-shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { Locale } from "@/i18n/generated";
import { localePath } from "@/i18n/path";
import { formatDocument } from "@/lib/document";
import type { CustomerDetail, VehicleRow } from "@/modules/customers";
import { formatPlate } from "@/modules/customers/validation";
import {
	type Copy,
	CustomerForm,
	formatMoney,
	formatPhone,
	VehicleForm,
} from "../customer-form";

/** Dados do cliente e tabela de veículos; editar e adicionar veículo abrem Sheets. */
export function CustomerDetailView({
	detail,
	locale,
	copy,
}: {
	detail: CustomerDetail;
	locale: Locale;
	copy: Copy;
}) {
	const router = useRouter();
	const { customer, vehicles, can } = detail;
	const [editingCustomer, setEditingCustomer] = useState(false);
	// undefined = fechado; null = novo veículo; VehicleRow = editando.
	const [vehicle, setVehicle] = useState<VehicleRow | null | undefined>();
	const canEditCustomer = can.edit || can.changeCreditLimit;
	const canAddVehicle = can.create || can.edit;
	const header = copy.table;

	function done(close: () => void) {
		return (message: string) => {
			close();
			toast(message);
			router.refresh();
		};
	}

	return (
		<div className="flex flex-col gap-6">
			<Link
				className={buttonVariants({
					variant: "ghost",
					size: "sm",
					className: "self-start",
				})}
				href={localePath(locale, "/painel/clientes")}
				prefetch={false}
			>
				<ArrowLeftIcon />
				{copy.detail.back}
			</Link>
			<PageHeader
				action={
					<div className="flex gap-2">
						{canEditCustomer && (
							<Button
								onClick={() => setEditingCustomer(true)}
								variant="outline"
							>
								{copy.detail.edit}
							</Button>
						)}
						{canAddVehicle && (
							<Button onClick={() => setVehicle(null)}>
								<PlusIcon />
								{copy.detail.addVehicle}
							</Button>
						)}
					</div>
				}
				description={`${copy.kind[customer.kind]} · ${customer.city}/${customer.state}`}
				title={customer.name}
			/>
			<dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-canvas p-4 sm:grid-cols-4">
				<Item label={header.document}>
					<span className="font-mono text-[12.5px]">
						{formatDocument(customer.document)}
					</span>
				</Item>
				<Item label={header.phone}>
					<span className="tabular-nums">
						{customer.phone ? formatPhone(customer.phone) : "-"}
					</span>
				</Item>
				<Item label={header.limit}>
					<span className="tabular-nums">
						{customer.kind === "fleet_owner"
							? formatMoney(customer.creditLimit)
							: "-"}
					</span>
				</Item>
				<Item label={header.status}>
					<span
						className={
							customer.status === "blocked"
								? "font-medium text-destructive"
								: undefined
						}
					>
						{customer.status === "blocked" ? header.blocked : header.active}
					</span>
				</Item>
			</dl>
			<h2 className="font-semibold tracking-tight">{copy.detail.vehicles}</h2>
			{vehicles.length === 0 ? (
				<EmptyState
					text={copy.detail.noVehiclesText}
					title={copy.detail.noVehicles}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{copy.vehicleForm.plate}</TableHead>
							<TableHead>{copy.vehicleForm.model}</TableHead>
							<TableHead className="text-right">
								{copy.vehicleForm.axles}
							</TableHead>
							<TableHead className="text-right">
								{copy.vehicleForm.year}
							</TableHead>
							{can.edit && (
								<TableHead className="text-right">{header.actions}</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{vehicles.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="font-medium font-mono text-[12.5px]">
									{formatPlate(item.plate)}
								</TableCell>
								<TableCell>{item.model}</TableCell>
								<TableCell className="text-right tabular-nums">
									{item.axles}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{item.year ?? ""}
								</TableCell>
								{can.edit && (
									<TableCell className="text-right">
										<Button
											aria-label={`${copy.detail.editVehicle} ${formatPlate(item.plate)}`}
											onClick={() => setVehicle(item)}
											size="sm"
											variant="ghost"
										>
											{copy.detail.edit}
										</Button>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			<Sheet onOpenChange={setEditingCustomer} open={editingCustomer}>
				<SheetContent className="data-[side=right]:sm:max-w-lg">
					{editingCustomer && (
						<CustomerForm
							can={can}
							copy={copy}
							customer={customer}
							onDone={done(() => setEditingCustomer(false))}
						/>
					)}
				</SheetContent>
			</Sheet>
			<Sheet
				onOpenChange={(open) => !open && setVehicle(undefined)}
				open={vehicle !== undefined}
			>
				<SheetContent className="data-[side=right]:sm:max-w-lg">
					{vehicle !== undefined && (
						<VehicleForm
							copy={copy}
							customerId={customer.id}
							onDone={done(() => setVehicle(undefined))}
							vehicle={vehicle}
						/>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}

function Item({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd>{children}</dd>
		</div>
	);
}
