import { TRPCContext } from "@mono/trpc-server/dist/server";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { AnyRouter } from "@trpc/server";
import {
	CreateHTTPContextOptions,
	createHTTPHandler,
} from "@trpc/server/adapters/standalone";
import { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { MainTrpcRouterFactory } from "./trpc.router";

@Injectable()
export class TRPCService implements OnModuleInit {
	private httpHandler!: ReturnType<typeof createHTTPHandler<AnyRouter>>;
	private actualAppRouter!: AnyRouter;

	constructor(
		private readonly authService: AuthService,
		private readonly routerFactory: MainTrpcRouterFactory,
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
			// Handle this case, e.g., by not setting up httpHandler or throwing an error
			// For now, let's proceed but log a clear warning.
			// This might happen if MainTrpcRouterFactory failed to find procedures.
		} else {
			console.log(
				"✅ TRPCService: Initializing with actual appRouter from factory.",
			);
		}

		this.httpHandler = createHTTPHandler({
			router: this.actualAppRouter,
			createContext: ({
				req,
				res,
			}: CreateHTTPContextOptions): TRPCContext => {
				const authHeader = req.headers.authorization;
				let user: TRPCContext["user"] = null;

				if (authHeader?.startsWith("Bearer ")) {
					const token = authHeader.substring(7);
					try {
						const payload = this.authService.decodeToken(token);
						user = {
							id: payload.id,
							username: payload.email,
							picture: payload.email,
						};
					} catch (error) {
						user = null;
					}
				}
				// @ts-ignore
				return { req, res, user };
			},
			onError: ({ error, path, type, input, ctx }) => {
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
