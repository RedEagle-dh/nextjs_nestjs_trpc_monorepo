import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../../packages/trpc/server";

export const { TRPCProvider, useTRPC, useTRPCClient } =
	createTRPCContext<AppRouter>();
