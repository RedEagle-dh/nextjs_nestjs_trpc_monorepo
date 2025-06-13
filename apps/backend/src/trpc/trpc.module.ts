import { GeneratedTrpcRouterProvider } from "@mono/database";
import { Module } from "@nestjs/common";
import { DbService } from "src/db/db.service";
import { HealtchcheckTrpcRouter } from "src/healthcheck/healthcheck.trpc";
import { AuthModule } from "../auth/auth.module";
import { TRPCController } from "./trpc.controller";
import { MainTrpcRouterFactory } from "./trpc.router";
import { TRPCService } from "./trpc.service";

@Module({
	imports: [AuthModule],
	controllers: [TRPCController],
	providers: [
		DbService,
		TRPCService,
		MainTrpcRouterFactory,
		HealtchcheckTrpcRouter,
		GeneratedTrpcRouterProvider,
	],
})
export class TRPCModule {}
