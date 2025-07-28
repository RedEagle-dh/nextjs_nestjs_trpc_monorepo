import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";

import { PrismaClient } from "@mono/database/prisma/client";

@Injectable()
export class DbService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DbService.name);
	constructor() {
		super({
			datasources: {
				db: {
					url: process.env.DATABASE_URL,
				},
			},
		});
	}

	onModuleInit() {
		this.$connect();
		this.logger.log("Prisma Client connected to the database.");
	}

	onModuleDestroy() {
		this.$disconnect();
		this.logger.log("Prisma Client disconnected from the database.");
	}
}
