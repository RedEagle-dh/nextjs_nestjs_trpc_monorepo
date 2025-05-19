import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { MiddlewareOptions, TRPCMiddleware } from "nestjs-trpc";
import type { ContextType, ModifiedContextType } from "src/app.context";
import type { AuthService } from "./auth.service";

@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
	constructor(private readonly authService: AuthService) {}

	// biome-ignore lint/suspicious/noExplicitAny: Pnpm type error
	async use(opts: MiddlewareOptions<ContextType>): Promise<any> {
		const start = Date.now();
		const { next, path, type, ctx } = opts;

		console.log("reading token");
		// extract http only cookie
		console.log(ctx.req);
		console.log(ctx.req.cookies);
		const token = ctx.req.cookies.token;
		console.log("token read: ", token);
		if (!token) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "No token provided",
			});
			//throw new Error('No token provided');
		}
		const decoded = this.authService.decodeToken(token);

		const modifiedCtx: ModifiedContextType = {
			...ctx,
			decodedJwt: decoded,
		};

		const result = await next({ ...opts, ctx: modifiedCtx });

		const durationMs = Date.now() - start;
		const meta = { path, type, durationMs };

		result.ok
			? console.log("OK request timing:", meta)
			: console.error("Non-OK request timing", meta);

		return result;
	}
}
