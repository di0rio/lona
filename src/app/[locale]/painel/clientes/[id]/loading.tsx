import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<section aria-busy="true" className="flex flex-col gap-6">
			<Skeleton className="h-8 w-56" />
			<Skeleton className="h-20 w-full" />
			{[0, 1, 2].map((i) => (
				<Skeleton className="h-11 w-full" key={i} />
			))}
		</section>
	);
}
