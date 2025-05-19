import { TRPCContext } from "@n2-stickstoff-monorepo/trpc-server/dist/server";
// src/trpc/trpc.service.ts
import { Injectable, OnModuleInit } from "@nestjs/common"; // OnModuleInit hinzufügen
// Stelle sicher, dass dein Contract-Paket TRPCContext exportiert.
// (z.B. packages/trpc-contract/src/trpc-context.ts)
import { AnyRouter } from "@trpc/server"; // Für die Typisierung des Routers
import {
	CreateHTTPContextOptions,
	createHTTPHandler,
} from "@trpc/server/adapters/standalone";
import { Request, Response } from "express";
import { AuthService, JWTPayload } from "../auth/auth.service";
import { MainTrpcRouterFactory } from "./trpc.router";

@Injectable()
export class TRPCService implements OnModuleInit {
	// OnModuleInit implementieren
	// Der httpHandler wird jetzt in onModuleInit initialisiert
	private httpHandler!: ReturnType<typeof createHTTPHandler<AnyRouter>>; // Definitiv Zuweisung mit !
	private actualAppRouter!: AnyRouter;

	constructor(
		private readonly authService: AuthService,
		private readonly routerFactory: MainTrpcRouterFactory, // Injiziere die Router Factory
	) {}

	// onModuleInit wird aufgerufen, nachdem alle Module initialisiert wurden
	// und MainTrpcRouterFactory seinen appRouter gebaut hat.
	onModuleInit() {
		this.actualAppRouter = this.routerFactory.getAppRouter(); // Hole den echten Router

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
			router: this.actualAppRouter, // Verwende den echten, dynamisch erstellten Router
			createContext: ({
				req,
				res,
			}: CreateHTTPContextOptions): TRPCContext => {
				// Die Kontext-Erstellung bleibt gleich
				const authHeader = req.headers.authorization;
				let user: TRPCContext["user"] = null; // Typ korrigiert auf TRPCContext['user']

				if (authHeader?.startsWith("Bearer ")) {
					const token = authHeader.substring(7);
					try {
						const payload = this.authService.decodeToken(token);
						// Stelle sicher, dass das Payload-Objekt mit TRPCContext['user'] übereinstimmt
						user = {
							id: payload.id,
							username: payload.username,
							picture: payload.picture,
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
					// error.cause, // Bei Bedarf
				);
				// Hier kannst du weiteres Logging/Fehlerbehandlung hinzufügen
			},
		});
	}

	async handleRequest(req: Request, res: Response) {
		// Der console.log hier ist gut für das Debugging des Controllers
		// console.log("TRPCService: handleRequest called by TRPCController");
		console.log(
			`TRPCController: ${req.url}, ${req.originalUrl}, ${req.baseUrl} ${req.path}`,
		);

		if (!this.httpHandler) {
			console.error(
				"FATAL: TRPCService.httpHandler not initialized. Likely an issue in onModuleInit or MainTrpcRouterFactory.",
			);
			res.status(500).json({ message: "tRPC handler not initialized" });
			return;
		}

		const originalUrl = req.url;
		const controllerBasePath = "/trpc";

		let effectiveUrl = req.url;
		if (
			req.originalUrl.startsWith(`${controllerBasePath}/`) &&
			req.url.startsWith(`${controllerBasePath}/`)
		) {
			// Dieser Fall sollte eigentlich nicht eintreten, wenn req.url korrekt relativ ist.
			// Aber um den Fehler "Path: trpc/..." abzufangen:
			effectiveUrl = req.url.substring(controllerBasePath.length);
			console.log(
				`TRPCService: Adjusting req.url from '${req.url}' to '${effectiveUrl}' for tRPC handler.`,
			);

			// @ts-ignore
		} else if (
			req.url.startsWith(controllerBasePath) &&
			// @ts-ignore
			controllerBasePath !== "/"
		) {
			// Falls der Controller im Root gemountet wäre, würde das nicht zutreffen.
			// Dies ist eine Vorsichtsmaßnahme, falls req.url nicht korrekt relativiert wurde.
			effectiveUrl = req.url.substring(controllerBasePath.length);
			console.log(
				`TRPCService: Adjusting req.url (fallback) from '${req.url}' to '${effectiveUrl}' for tRPC handler.`,
			);
		}

		const tempOriginalUrl = req.url; // Sichere die aktuelle req.url
		req.url = effectiveUrl; // Setze die für tRPC bereinigte URL

		try {
			this.httpHandler(req, res);
		} finally {
			req.url = tempOriginalUrl; // Setze req.url zurück, falls andere NestJS Handler folgen (unwahrscheinlich bei @All)
		}
	}
}
