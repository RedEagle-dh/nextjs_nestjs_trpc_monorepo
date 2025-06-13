import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { PrismaClient } from "@mono/database/prisma/client";

@Injectable()
export class DbService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
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
		console.log("Prisma Client connected to the database.");
	}

	onModuleDestroy() {
		this.$disconnect();
		console.log("Prisma Client disconnected from the database.");
	}
}
