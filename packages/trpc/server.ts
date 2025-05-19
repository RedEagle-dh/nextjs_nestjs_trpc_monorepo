import type { Request, Response } from "express";

export type TRPCContext = {
	req: Request;
	res: Response;
	user?: {
		id: string;
		username: string;
		picture: string;
	} | null;
};
