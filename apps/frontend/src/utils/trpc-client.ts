// This trpcClient can be used in non-react components but client-side
"use client";

import type { AppRouter } from "@mono/database/contract";
import {
	TRPCLink,
	createTRPCClient,
	httpBatchLink,
	retryLink,
} from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { getSession } from "next-auth/react";

const errorHandlingLink: TRPCLink<AppRouter> = () => {
	return ({ next, op }) => {
		return observable((observer) => {
			const unsub = next(op).subscribe({
				next(v) {
					observer.next(v);
				},
				error(err) {
					console.log("tRPC client error:", err);
					observer.error(err);
				},
				complete() {
					observer.complete();
				},
			});
			return unsub;
		});
	};
};

export function getTrpcClient() {
	return createTRPCClient<AppRouter>({
		links: [
			errorHandlingLink,
			retryLink({
				retry: (opts) => opts.op.type === "query" && opts.attempts <= 3,
				retryDelayMs: (i) => Math.min(1000 * 2 ** i, 30000),
			}),
			httpBatchLink({
				url: "/api/trpc",
				headers: async () => {
					const headers: Record<string, string> = {};
					const session =
						typeof window !== "undefined"
							? await getSession()
							: null;
					if (session?.accessToken)
						headers.Authorization = `Bearer ${session.accessToken}`;
					return headers;
				},
			}),
		],
	});
}
