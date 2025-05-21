import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DbModule } from "src/db/db.module";
import { DbService } from "src/db/db.service";
import { AuthService } from "./auth.service";

@Module({
	providers: [AuthService],
	exports: [AuthService],
	imports: [DbModule, ConfigModule],
})
export class AuthModule {}
