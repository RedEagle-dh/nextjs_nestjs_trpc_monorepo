import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden rounded-full transition-all",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-stone-950 text-stone-200 [a&]:hover:bg-stone-800",
				secondary:
					"border-transparent bg-stone-200 text-stone-950 [a&]:hover:bg-stone-300",
			},
			size: {
				small: "px-1 py-0.25 text-[10px]",
				medium: "px-2 py-0.5 text-xs",
				large: "px-3 py-1 text-sm [&>svg]:!h-4 [&>svg]:!w-4 gap-2",
				extraLarge:
					"px-4 py-1.5 text-base [&>svg]:!h-5 [&>svg]:!w-5 gap-2",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "medium",
		},
	},
);

function Badge({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";

	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
