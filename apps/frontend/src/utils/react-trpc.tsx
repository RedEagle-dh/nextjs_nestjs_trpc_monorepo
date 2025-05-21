"use client";
import type { AppRouter } from "@mono/trpc-server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { getSession, useSession } from "next-auth/react";
import { useState } from "react";
import { TRPCProvider } from "./trpc";

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

export function ReactTRPCProvider({ children }: { children: React.ReactNode }) {
	const queryClient = getQueryClient();
	const [trpcClient] = useState(() =>
		createTRPCClient<AppRouter>({
			links: [
				httpBatchLink({
					url: "http://localhost:3001/trpc",
					headers: async () => {
						const baseHeaders: Record<string, string> = {
							"Content-Type": "application/json",
						};

						if (typeof window !== "undefined") {
							const session = await getSession();
							if (session?.accessToken) {
								return {
									...baseHeaders,
									Authorization: `Bearer ${session.accessToken}`,
								};
							}
						}

						return {
							"Content-Type": "application/json",
						};
					},
				}),
			],
		}),
	);
	return (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		</QueryClientProvider>
	);
}
