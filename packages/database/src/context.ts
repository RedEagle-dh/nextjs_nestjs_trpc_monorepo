import type { Request, Response } from "express";

export type InnerTRPCContext = {
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

export type TRPCContext = InnerTRPCContext & {
	req: Request;
	res: Response;
};
