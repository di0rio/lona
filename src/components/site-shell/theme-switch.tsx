"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

// Os dois ícones ficam no HTML e o CSS escolhe, pra não piscar antes do tema carregar.
export function ThemeSwitch({ label }: { label: string }) {
	const { resolvedTheme, setTheme } = useTheme();

	return (
		<Button
			aria-label={label}
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
			size="icon"
			variant="ghost"
		>
			<SunIcon aria-hidden="true" className="hidden dark:block" />
			<MoonIcon aria-hidden="true" className="dark:hidden" />
		</Button>
	);
}
