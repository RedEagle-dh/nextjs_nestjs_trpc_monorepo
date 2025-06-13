import { TRPCError, initTRPC } from "@trpc/server";
import type { InnerTRPCContext } from "./context";

type AuthenticatedContext = InnerTRPCContext & {
	session: {
		user: {
			id: string;
			username: string;
			email: string;
			role: string;
		};
		accessToken: string | null;
	};
};

const t = initTRPC.context<InnerTRPCContext>().create();

export const createTRPCRouter = t.router;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const procedure = publicProcedure;

const isAuthenticated = middleware(async (opts) => {
	if (!opts.ctx.session?.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authenticated.",
		});
	}
	return opts.next({
		ctx: opts.ctx as AuthenticatedContext,
	});
});

export const protectedProcedure = t.procedure.use(isAuthenticated);
