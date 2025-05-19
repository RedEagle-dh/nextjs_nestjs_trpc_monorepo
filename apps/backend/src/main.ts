import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableCors({
		origin: true, // Für die Entwicklung true setzen oder spezifische Origins erlauben
		// z.B. 'http://localhost:DEIN_FRONTEND_PORT' (wenn Frontend auf anderem Port läuft)
		methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS", // OPTIONS ist wichtig
		allowedHeaders: "Content-Type, Authorization, baggage, sentry-trace", // Wichtig: Content-Type und ggf. Auth-Header erlauben. Baggage/sentry-trace sind Beispiele für tRPC.
		credentials: true, // Falls du Cookies oder Authorization-Header mit Credentials sendest
		preflightContinue: false, // Wichtig, damit NestJS OPTIONS-Requests korrekt beendet
		optionsSuccessStatus: 204, // Standard für erfolgreiche OPTIONS-Responses
	});
	await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
