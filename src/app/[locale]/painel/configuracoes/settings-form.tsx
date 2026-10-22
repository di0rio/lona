"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { CompanySettings } from "@/modules/access";

type Copy = {
	readOnly: string;
	saved: string;
	undo: string;
	error: string;
	usesBranches: { label: string; help: string };
	workOrderFlow: {
		label: string;
		simple: string;
		simpleHelp: string;
		full: string;
		fullHelp: string;
	};
	saleRequiresQuote: { label: string; help: string };
	cashRegisterRequired: { label: string; help: string };
};

type Toggle = Exclude<keyof CompanySettings, "work_order_flow">;

/**
 * Cada alteração salva na hora: a tela muda primeiro (otimista), o toast oferece "Desfazer",
 * e se o servidor recusar a opção volta ao valor anterior com a mensagem de erro.
 */
export function SettingsForm({
	initial,
	canConfigure,
	copy,
}: {
	initial: CompanySettings;
	canConfigure: boolean;
	copy: Copy;
}) {
	const router = useRouter();
	const [settings, setSettings] = useState(initial);
	const [failed, setFailed] = useState(false);

	async function change(patch: Partial<CompanySettings>, isUndo = false) {
		const previous = settings;
		setSettings({ ...settings, ...patch });
		setFailed(false);
		const { error } = await api().access.settings.patch(patch);
		if (error) {
			setSettings(previous);
			setFailed(true);
			return;
		}
		// O menu (Filiais) depende destas opções e vive no layout, que só recarrega com o refresh.
		router.refresh();
		if (isUndo) return;
		const undoPatch = Object.fromEntries(
			Object.keys(patch).map((key) => [
				key,
				previous[key as keyof CompanySettings],
			]),
		);
		toast(copy.saved, {
			action: { label: copy.undo, onClick: () => change(undoPatch, true) },
		});
	}

	function toggle(key: Toggle, label: string, help: string) {
		return (
			<div className="flex items-start justify-between gap-4 rounded-xl border p-4">
				<div className="flex flex-col gap-1">
					<span className="font-medium" id={`${key}-label`}>
						{label}
					</span>
					<span className="text-muted-foreground text-sm" id={`${key}-help`}>
						{help}
					</span>
				</div>
				<Switch
					aria-describedby={`${key}-help`}
					aria-labelledby={`${key}-label`}
					checked={settings[key]}
					disabled={!canConfigure}
					onCheckedChange={(checked) => change({ [key]: checked })}
				/>
			</div>
		);
	}

	const flow = copy.workOrderFlow;
	return (
		<div className="flex flex-col gap-4">
			{!canConfigure && (
				<p className="rounded-xl bg-canvas p-3.5 text-sm">{copy.readOnly}</p>
			)}
			{toggle("uses_branches", copy.usesBranches.label, copy.usesBranches.help)}
			<fieldset className="flex flex-col gap-3 rounded-xl border p-4">
				<legend className="px-1 font-medium">{flow.label}</legend>
				<RadioGroup
					disabled={!canConfigure}
					onValueChange={(value) =>
						change({
							work_order_flow: value as CompanySettings["work_order_flow"],
						})
					}
					value={settings.work_order_flow}
				>
					{(
						[
							["simple", flow.simple, flow.simpleHelp],
							["full", flow.full, flow.fullHelp],
						] as const
					).map(([value, label, help]) => (
						<div className="flex items-start gap-3" key={value}>
							<RadioGroupItem
								aria-describedby={`flow-${value}-help`}
								aria-labelledby={`flow-${value}-label`}
								className="mt-1"
								value={value}
							/>
							<span className="flex flex-col">
								<span id={`flow-${value}-label`}>{label}</span>
								<span
									className="text-muted-foreground text-sm"
									id={`flow-${value}-help`}
								>
									{help}
								</span>
							</span>
						</div>
					))}
				</RadioGroup>
			</fieldset>
			{toggle(
				"sale_requires_quote",
				copy.saleRequiresQuote.label,
				copy.saleRequiresQuote.help,
			)}
			{toggle(
				"cash_register_required",
				copy.cashRegisterRequired.label,
				copy.cashRegisterRequired.help,
			)}
			{failed && (
				<p className="text-destructive text-sm" role="alert">
					{copy.error}
				</p>
			)}
		</div>
	);
}
