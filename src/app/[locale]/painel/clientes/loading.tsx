import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<section aria-busy="true" className="flex flex-col gap-6">
			<Skeleton className="h-8 w-40" />
			<Skeleton className="h-9 w-full max-w-sm" />
			{[0, 1, 2, 3].map((i) => (
				<Skeleton className="h-11 w-full" key={i} />
			))}
		</section>
	);
}
