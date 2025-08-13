"use client";
import { api } from "@/utils/trpc";
import type { AppRouter } from "@mono/database/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCLink, httpBatchLink, retryLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { getSession, signOut } from "next-auth/react";
import { useState } from "react";

const trpcApiUrl = process.env.NEXT_PUBLIC_BACKEND_URL
	? `${process.env.NEXT_PUBLIC_BACKEND_URL}`
	: "/api/trpc";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// With SSR, we usually want to set some default staleTime
				// above 0 to avoid refetching immediately on the client
				staleTime: 60 * 1000,
			},
		},
	});
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
	if (typeof window === "undefined") {
		// Server: always make a new query client
		return makeQueryClient();
	}
	// Browser: make a new query client if we don't already have one
	// This is very important, so we don't re-make a new client if React
	// suspends during the initial render. This may not be needed if we
	// have a suspense boundary BELOW the creation of the query client
	if (!browserQueryClient) browserQueryClient = makeQueryClient();
	return browserQueryClient;
}

const errorHandlingLink: TRPCLink<AppRouter> = () => {
	return ({ next, op }) => {
		return observable((observer) => {
			const unsubscribe = next(op).subscribe({
				next(value) {
					observer.next(value);
				},
				error(error) {
					console.log("TRPC Error caught:", error);

					if (error.data?.code === "UNAUTHORIZED") {
						signOut({ callbackUrl: "/login" });

						observer.next({
							result: { data: { type: "unauthorized_handled" } },
						});
						observer.complete();
						return;
					}

					observer.error(error);
				},
				complete() {
					observer.complete();
				},
			});
			return unsubscribe;
		});
	};
};

export function ReactTRPCProvider({ children }: { children: React.ReactNode }) {
	const queryClient = getQueryClient();
	const [trpcClient] = useState(() =>
		api.createClient({
			links: [
				errorHandlingLink,
				retryLink({
					retry(opts) {
						console.log(opts.error.data);
						if (
							opts.error.data &&
							opts.error.data.code !== "UNAUTHORIZED" &&
							opts.error.data.code !== "INTERNAL_SERVER_ERROR" &&
							opts.error.data.code !== "FORBIDDEN"
						) {
							// Don't retry on non-500s
							return false;
						}
						if (opts.op.type !== "query") {
							// Only retry queries
							return false;
						}
						// Retry up to 3 times
						return opts.attempts <= 3;
					},
					// Double every attempt, with max of 30 seconds (starting at 1 second)
					retryDelayMs: (attemptIndex) =>
						Math.min(1000 * 2 ** attemptIndex, 30000),
				}),
				httpBatchLink({
					url: trpcApiUrl,
					headers: async () => {
						const baseHeaders: Record<string, string> = {};

						if (typeof window !== "undefined") {
							const session = await getSession();
							if (session?.accessToken) {
								baseHeaders.Authorization = `Bearer ${session.accessToken}`;
							}
						}

						return baseHeaders;
					},
				}),
			],
		}),
	);
	return (
		<api.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				{children}
			</QueryClientProvider>
		</api.Provider>
	);
}
