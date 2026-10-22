import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<section aria-busy="true" className="flex max-w-3xl flex-col gap-6">
			<Skeleton className="h-8 w-72" />
			<Skeleton className="h-5 w-full max-w-md" />
			{[0, 1, 2, 3].map((i) => (
				<Skeleton className="h-16 w-full" key={i} />
			))}
		</section>
	);
}
