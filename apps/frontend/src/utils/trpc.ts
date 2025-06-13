import type { AppRouter } from "@mono/database/contract";
import { createTRPCReact } from "@mono/database/trpc/react";
import { inferRouterOutputs } from "@trpc/server";

export const api = createTRPCReact<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;
