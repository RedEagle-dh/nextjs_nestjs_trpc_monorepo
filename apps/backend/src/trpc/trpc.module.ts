import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TRPCController } from "./trpc.controller";
import { TRPCService } from "./trpc.service";

@Module({
	imports: [AuthModule],
	controllers: [TRPCController],
	providers: [TRPCService],
})
export class TRPCModule {}
