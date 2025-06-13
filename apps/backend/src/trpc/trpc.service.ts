import { TRPCContext } from "@mono/database/";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { AnyTRPCRouter } from "@trpc/server";
import {
	CreateHTTPContextOptions,
	createHTTPHandler,
} from "@trpc/server/adapters/standalone";
import { Request, Response } from "express";
import { DbService } from "src/db/db.service";
import { AuthService } from "../auth/auth.service";
import { MainTrpcRouterFactory } from "./trpc.router";

@Injectable()
export class TRPCService implements OnModuleInit {
	private httpHandler!: ReturnType<typeof createHTTPHandler<AnyTRPCRouter>>;
	private actualAppRouter!: AnyTRPCRouter;

	constructor(
		private readonly authService: AuthService,
		private readonly routerFactory: MainTrpcRouterFactory,
		private readonly dbService: DbService,
	) {}

	onModuleInit() {
		this.actualAppRouter = this.routerFactory.getAppRouter();

		if (
			!this.actualAppRouter ||
			Object.keys(this.actualAppRouter._def.procedures).length === 0
		) {
			console.error(
				"⚠️ TRPCService: Actual appRouter from factory is missing or empty! Check MainTrpcRouterFactory logs.",
			);
		} else {
			console.log(
				"✅ TRPCService: Initializing with actual appRouter from factory.",
			);
		}

		this.httpHandler = createHTTPHandler({
			router: this.actualAppRouter,
			createContext: async ({
				req,
				res,
			}: CreateHTTPContextOptions): Promise<TRPCContext> => {
				const authHeader = req.headers.authorization;
				let session: TRPCContext["session"] | null;

				if (authHeader?.startsWith("Bearer ")) {
					const token = authHeader.substring(7);
					try {
						const payload =
							await this.authService.decodeAccessToken(token);
						session = {
							user: {
								id: payload.userId,
								username: payload.email,
								email: payload.email,
								role: payload.role,
							},
							accessToken: token,
						};
					} catch (error) {
						session = null;
					}
				}
				// @ts-ignore
				return { req, res, session, prisma: this.dbService };
			},
			onError: ({ error, path, type, input, ctx }) => {
				console.log(ctx);
				console.error(
					`tRPC Error in TRPCService (executing actual router) - Path: ${path}, Type: ${type}, Input: ${JSON.stringify(input)}, Error: ${error.message}`,
				);
			},
		});
	}

	async handleRequest(req: Request, res: Response) {
		if (!this.httpHandler) {
			console.error(
				"FATAL: TRPCService.httpHandler not initialized. Likely an issue in onModuleInit or MainTrpcRouterFactory.",
			);
			res.status(500).json({ message: "tRPC handler not initialized" });
			return;
		}

		const controllerBasePath = "/trpc";

		let effectiveUrl = req.url;
		if (
			req.originalUrl.startsWith(`${controllerBasePath}/`) &&
			req.url.startsWith(`${controllerBasePath}/`)
		) {
			effectiveUrl = req.url.substring(controllerBasePath.length);
		} else if (
			req.url.startsWith(controllerBasePath) &&
			// @ts-ignore
			controllerBasePath !== "/"
		) {
			effectiveUrl = req.url.substring(controllerBasePath.length);
		}

		const tempOriginalUrl = req.url;
		req.url = effectiveUrl;

		try {
			this.httpHandler(req, res);
		} finally {
			req.url = tempOriginalUrl;
		}
	}
}
