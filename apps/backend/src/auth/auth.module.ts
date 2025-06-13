import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DbModule } from "src/db/db.module";
import { RedisModule } from "src/redis/redis.module";
import { AuthService } from "./auth.service";

@Module({
	providers: [AuthService],
	exports: [AuthService],
	imports: [DbModule, ConfigModule, RedisModule],
})
export class AuthModule {}
