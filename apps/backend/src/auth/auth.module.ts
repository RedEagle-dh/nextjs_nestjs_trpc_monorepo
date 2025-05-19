import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DbModule } from "src/db/db.module";
import { AuthService } from "./auth.service";

@Module({
	providers: [AuthService],
	exports: [AuthService],
	imports: [DbModule, ConfigModule],
})
export class AuthModule {}
