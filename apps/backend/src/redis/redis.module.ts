import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RedisService } from "./redis.service";

@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: "REDIS_CLIENT",
			useFactory: (configService: ConfigService) => {
				const redisUrl = configService.get<string>("REDIS_URL");
				if (!redisUrl) {
					throw new Error(
						"REDIS_URL ist nicht in der Konfiguration gesetzt!",
					);
				}
				return new Redis(redisUrl);
			},
			inject: [ConfigService],
		},
		RedisService,
	],
	exports: [RedisService],
})
export class RedisModule {}
