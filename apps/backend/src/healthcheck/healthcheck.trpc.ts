import { Injectable } from "@nestjs/common";
import { TrpcProcedure, TrpcRouter } from "src/trpc/decorators";
import { z } from "zod";
@Injectable()
@TrpcRouter({ domain: "user" })
export class UserTrpcRouter {
	@TrpcProcedure({
		inputType: z.string(),
		outputType: z.object({
			status: z.string(),
			timestamp: z.string(),
		}),
		type: "query",
		isProtected: false,
	})
	async getHealthcheck() {
		console.log(
			"tRPC contract placeholder for 'user.getHealthcheck' called.",
		);
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
	}
}
