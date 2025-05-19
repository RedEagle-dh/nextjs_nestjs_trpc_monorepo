import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import type { DbService } from "./db/db.service";

export type ContextType = {
	req: Request;
	res: Response;
};

export type ModifiedContextType = ContextType & {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	decodedJwt: any; // Hier muss das decoded JWT-Objekt gespeichert werden
};

@Injectable()
export class AppContext implements TRPCContext {
	constructor(private dbService: DbService) {} // UserService oder DbService zum Laden des Users

	create(opts: ContextOptions): ContextType {
		return {
			req: opts.req,
			res: opts.res,
		};
	}
}
