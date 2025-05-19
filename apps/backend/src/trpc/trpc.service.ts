import { appRouter } from "@n2-stickstoff-monorepo/trpc-server";
import { Injectable } from "@nestjs/common";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { Request, Response } from "express";
import { AuthService, JWTPayload } from "../auth/auth.service";

@Injectable()
export class TRPCService {
	constructor(private readonly authService: AuthService) {}

	async handleRequest(req: Request, res: Response) {
		// Token aus Request-Header extrahieren
		const authHeader = req.headers.authorization;
		let user:
			| (JWTPayload & {
					iat: number;
					exp: number;
			  })
			| null = null;

		if (authHeader?.startsWith("Bearer ")) {
			const token = authHeader.substring(7);
			try {
				user = this.authService.decodeToken(token);
			} catch (error) {
				// Token nicht gültig, Benutzer bleibt null
			}
		}

		const httpHandler = createHTTPHandler({
			router: appRouter,
			createContext: () => ({ req, res, user }),
		});

		// Request direkt an den tRPC-Handler weiterleiten
		return httpHandler(req, res);
	}
}
