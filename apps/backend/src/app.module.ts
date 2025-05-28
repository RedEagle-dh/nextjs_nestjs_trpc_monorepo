import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { AuthService } from "./auth/auth.service";
import { DbModule } from "./db/db.module";
import { RedisModule } from "./redis/redis.module";
import { TRPCModule } from "./trpc/trpc.module";

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: [".env"],
			isGlobal: true,
		}),
		TRPCModule,
		AuthModule,
		DbModule,
		RedisModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
