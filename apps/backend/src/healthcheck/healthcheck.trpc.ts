import { Injectable } from "@nestjs/common";
import {
	TrpcProcedure,
	TrpcProcedureParameters,
	TrpcRouter,
} from "src/trpc/decorators";
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

	@TrpcProcedure({
		type: "mutation",
		isProtected: false,
		inputType: z.object({
			healthcheck: z.string(),
		}),
		outputType: z.object({
			status: z.string(),
			timestamp: z.string(),
		}),
	})
	async mutateHealthcheck() {
		console.log(
			"tRPC contract placeholder for 'user.mutateHealthcheck' called.",
		);
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
	}

	@TrpcProcedure({
		type: "mutation",
		isProtected: true,
		inputType: z.object({
			healthcheck: z.string(),
		}),
		outputType: z.object({
			status: z.string(),
			timestamp: z.string(),
		}),
	})
	async protectedHealthcheck({ ctx, input }) {
		console.log(
			"tRPC contract placeholder for 'user.protectedHealthcheck' called.",
		);
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
	}
}
