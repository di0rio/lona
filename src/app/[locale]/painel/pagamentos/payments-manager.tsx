"use client";

import { PageHeader } from "@/components/site-shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaymentsView } from "@/modules/payments";
import { AcquirersTab } from "./acquirers-tab";
import { MethodsTab } from "./methods-tab";
import type { Copy } from "./shared";
import { TermsTab } from "./terms-tab";

/** Formas, operadoras com taxas e condições de pagamento. Sem payment_methods.manage, só consulta. */
export function PaymentsManager({
	view,
	today,
	copy,
}: {
	view: PaymentsView;
	/** YYYY-MM-DD no fuso do Brasil. */
	today: string;
	copy: Copy;
}) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader description={copy.description} title={copy.title} />
			{!view.canManage && (
				<p className="rounded-xl bg-canvas p-3.5 text-sm">{copy.readOnly}</p>
			)}
			<Tabs defaultValue="methods">
				<TabsList>
					<TabsTrigger value="methods">{copy.tabs.methods}</TabsTrigger>
					<TabsTrigger value="acquirers">{copy.tabs.acquirers}</TabsTrigger>
					<TabsTrigger value="terms">{copy.tabs.terms}</TabsTrigger>
				</TabsList>
				<TabsContent className="mt-4 flex flex-col gap-4" value="methods">
					<MethodsTab copy={copy} view={view} />
				</TabsContent>
				<TabsContent className="mt-4 flex flex-col gap-6" value="acquirers">
					<AcquirersTab copy={copy} today={today} view={view} />
				</TabsContent>
				<TabsContent className="mt-4 flex flex-col gap-4" value="terms">
					<TermsTab copy={copy} view={view} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
