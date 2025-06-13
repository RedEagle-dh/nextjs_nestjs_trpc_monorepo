import { NestFactory } from "@nestjs/core";
import { json } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.use(json({ limit: "5mb" }));
	app.enableCors({
		origin: true,
		methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
		allowedHeaders: "Content-Type, Authorization, baggage, sentry-trace",
		credentials: true,
		preflightContinue: false,
		optionsSuccessStatus: 204,
	});
	await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
