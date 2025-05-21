import { AppRouter } from "@mono/trpc-source/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";

const trpcApiUrl =
	process.env.NEXT_PUBLIC_TRPC_API_URL || "http://localhost:3001/trpc";

export const serverTrpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: trpcApiUrl,
		}),
	],
});

export { TRPCClientError };
