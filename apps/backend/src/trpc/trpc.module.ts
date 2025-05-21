import { Module } from "@nestjs/common";
import { AuthService } from "src/auth/auth.service";
import { UserTrpcRouter } from "src/healthcheck/healthcheck.trpc";
import { AuthModule } from "../auth/auth.module";
import { TRPCController } from "./trpc.controller";
import { MainTrpcRouterFactory } from "./trpc.router";
import { TRPCService } from "./trpc.service";

@Module({
	imports: [AuthModule],
	controllers: [TRPCController],
	providers: [TRPCService, MainTrpcRouterFactory, UserTrpcRouter],
})
export class TRPCModule {}
