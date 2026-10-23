"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/site-shell/empty-state";
import { PageHeader } from "@/components/site-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { CustomersView } from "@/modules/customers";
import {
	type Copy,
	CustomerForm,
	formatMoney,
	formatPhone,
} from "./customer-form";

/** Lista de clientes com busca por `?q=` e cadastro num Sheet. A linha leva ao detalhe. */
export function CustomersList({
	view,
	query,
	locale,
	copy,
}: {
	view: CustomersView;
	query: string;
	locale: Locale;
	copy: Copy;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const [search, setSearch] = useState(query);
	const [creating, setCreating] = useState(false);
	const header = copy.table;

	useEffect(() => {
		const text = search.trim();
		if (text === query) return;
		const timer = setTimeout(
			() =>
				router.replace(
					text ? `${pathname}?q=${encodeURIComponent(text)}` : pathname,
				),
			250,
		);
		return () => clearTimeout(timer);
	}, [search, query, pathname, router]);

	const detailHref = (id: string) =>
		localePath(locale, `/painel/clientes/${id}`);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					view.can.create && (
						<Button onClick={() => setCreating(true)}>
							<PlusIcon />
							{copy.new}
						</Button>
					)
				}
				description={copy.description}
				title={copy.title}
			/>
			<Input
				aria-label={copy.search.label}
				className="max-w-sm"
				onChange={(event) => setSearch(event.target.value)}
				placeholder={copy.search.placeholder}
				type="search"
				value={search}
			/>
			{view.customers.length === 0 ? (
				query ? (
					<EmptyState text={copy.noResults.text} title={copy.noResults.title} />
				) : (
					<EmptyState text={copy.empty.text} title={copy.empty.title} />
				)
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{header.name}</TableHead>
							<TableHead>{header.document}</TableHead>
							<TableHead>{header.phone}</TableHead>
							<TableHead>{header.city}</TableHead>
							<TableHead className="text-right">{header.limit}</TableHead>
							<TableHead className="text-right">{header.vehicles}</TableHead>
							<TableHead>{header.status}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{view.customers.map((customer) => (
							<TableRow
								className="cursor-pointer"
								key={customer.id}
								onClick={() => router.push(detailHref(customer.id))}
							>
								<TableCell className="font-medium">
									<Link href={detailHref(customer.id)} prefetch={false}>
										{customer.name}
									</Link>
									<span className="ml-2 rounded-full bg-canvas px-2 py-0.5 font-normal text-xs ring-1 ring-border">
										{copy.kind[customer.kind]}
									</span>
								</TableCell>
								<TableCell className="font-mono text-[12.5px]">
									{formatDocument(customer.document)}
								</TableCell>
								<TableCell className="tabular-nums">
									{customer.phone ? formatPhone(customer.phone) : ""}
								</TableCell>
								<TableCell>
									{customer.city}/{customer.state}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{customer.kind === "fleet_owner"
										? formatMoney(customer.creditLimit)
										: ""}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{customer.vehicleCount}
								</TableCell>
								<TableCell
									className={
										customer.status === "blocked"
											? "font-medium text-destructive"
											: "text-muted-foreground"
									}
								>
									{customer.status === "blocked"
										? header.blocked
										: header.active}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			{view.truncated && (
				<p className="text-muted-foreground text-sm">{copy.truncated}</p>
			)}
			<Sheet onOpenChange={setCreating} open={creating}>
				<SheetContent className="data-[side=right]:sm:max-w-lg">
					{creating && (
						<CustomerForm
							can={view.can}
							copy={copy}
							customer={null}
							onDone={(message) => {
								setCreating(false);
								toast(message);
								router.refresh();
							}}
						/>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}
