import { initTRPC } from "@trpc/server";
import type { Request, Response } from "express";
import { z } from "zod";

export type TRPCContext = {
	req: Request;
	res: Response;
	user?: {
		id: string;
		username: string;
		picture: string;
	} | null;
};

const t = initTRPC.context<TRPCContext>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
	if (!ctx.user) {
		throw new Error("Nicht authentifiziert");
	}
	return next({
		ctx: {
			user: ctx.user,
		},
	});
});

export const protectedProcedure = t.procedure.use(isAuthed);

export const appRouter = router({
	hello: publicProcedure
		.input(z.object({ name: z.string().optional() }))
		.query(({ input }) => {
			return `Hallo ${input.name || "Welt"}`;
		}),
});

export type AppRouter = typeof appRouter;
