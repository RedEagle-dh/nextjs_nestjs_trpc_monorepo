import { Injectable } from "@nestjs/common";
import { TrpcProcedure, TrpcRouter } from "src/trpc/decorators";
import { z } from "zod";
@Injectable()
@TrpcRouter({ domain: "healthcheck" })
export class HealtchcheckTrpcRouter {
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
	async protectedHealthcheck(props) {
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
	}
}
