"use server";
import { auth } from "@/auth";
import { AppRouter } from "@mono/trpc-source/index";
import {
	TRPCLink,
	createTRPCClient,
	httpBatchLink,
	retryLink,
} from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { signOut } from "next-auth/react";
import { redirect } from "next/navigation";

const trpcApiUrl =
	process.env.NEXT_PUBLIC_TRPC_API_URL || "http://localhost:3001/trpc";

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
						console.log("Handling unauthorized error");
						signOut();

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

export const serverTrpcClient = createTRPCClient<AppRouter>({
	links: [
		errorHandlingLink,
		retryLink({
			retry(opts) {
				console.log(opts.error.data);
				if (
					opts.error.data &&
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

				const session = await auth();
				console.log("Session server trpc: ", session);
				if (session?.accessToken) {
					baseHeaders.Authorization = `Bearer ${session.accessToken}`;
				}

				return baseHeaders;
			},
		}),
	],
});

export const publicServerTrpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: trpcApiUrl,
		}),
	],
});

export { TRPCClientError };
