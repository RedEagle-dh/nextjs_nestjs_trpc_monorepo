import type { Request, Response } from "express";

export type TRPCContext = {
	req: Request;
	res: Response;
	session: {
		user: {
			id: string;
			username: string;
			email: string;
			role: string;
		} | null;
		accessToken: string | null;
	} | null;
};
