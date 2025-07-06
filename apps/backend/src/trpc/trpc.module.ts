import { GeneratedTrpcRouterProvider } from "@mono/database";
import { Module } from "@nestjs/common";
import { DbService } from "src/db/db.service";
import { AuthModule } from "../auth/auth.module";
import { TRPCController } from "./trpc.controller";
import { MainTrpcRouterFactory } from "./trpc.router";
import { TRPCService } from "./trpc.service";
import { ExampleModule } from "src/example/example.module";

@Module({
	imports: [AuthModule, ExampleModule],
	controllers: [TRPCController],
	providers: [
		DbService,
		TRPCService,
		MainTrpcRouterFactory,
		GeneratedTrpcRouterProvider,
	],
})
export class TRPCModule {}
