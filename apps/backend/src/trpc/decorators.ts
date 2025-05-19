import { ZodSchema } from "zod";

export const TRPC_ROUTER_KEY = Symbol("TRPC_ROUTER_KEY");
export const TRPC_PROCEDURE_KEY = Symbol("TRPC_PROCEDURE_KEY");
export const TRPC_MIDDLEWARE_KEY = Symbol("TRPC_MIDDLEWARE_KEY");

export interface TrpcProcedureMetadata {
	path: string; // z.B. 'getById' oder 'user.getById' (wird vom Generator zusammengesetzt)
	type: "query" | "mutation";
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	inputType?: ZodSchema<any>;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	outputType?: ZodSchema<any>; // Optional, aber gut für den Generator
	middlewares: TrpcMiddlewareDefinition[]; // Für benutzerdefinierte Middleware
	isProtected: boolean; // Für Standard-Auth-Middleware
}

export interface TrpcRouterMetadata {
	domain?: string; // z.B. 'user', 'post'
	// Später ggf. weitere Optionen
}

// ----- Decorators -----

/**
 * Kennzeichnet eine NestJS-Provider-Klasse als Quelle für tRPC-Router-Definitionen.
 * @param metadata Metadaten für den Router (z.B. Domain-Name)
 */
export function TrpcRouter(metadata?: TrpcRouterMetadata): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(TRPC_ROUTER_KEY, metadata || {}, target);
	};
}

/**
 * Kennzeichnet eine Methode innerhalb einer @TrpcRouter()-Klasse als tRPC-Prozedur.
 * @param opts Optionen wie Input-Schema, Output-Schema, Typ (query/mutation)
 */
export function TrpcProcedure(opts: {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	inputType?: ZodSchema<any>;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	outputType?: ZodSchema<any>; // Für den Generator
	type: "query" | "mutation";
	isProtected?: boolean; // Standard-Authentifizierung
	middlewares?: TrpcMiddlewareDefinition[]; // Benutzerdefinierte Middleware
}): MethodDecorator {
	return (
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		target: any,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const procedures =
			Reflect.getMetadata(TRPC_PROCEDURE_KEY, target.constructor) || [];
		procedures.push({
			methodName: propertyKey,
			inputType: opts.inputType,
			outputType: opts.outputType,
			type: opts.type,
			isProtected: opts.isProtected || false,
			middlewares: opts.middlewares || [],
			// Die eigentliche Funktion ist descriptor.value
			implementation: descriptor.value,
		});
		Reflect.defineMetadata(
			TRPC_PROCEDURE_KEY,
			procedures,
			target.constructor,
		);
	};
}

// ----- Middleware-Definition -----
// Wir brauchen eine Möglichkeit, tRPC-Middleware-Funktionen zu referenzieren und
// sie mit NestJS DI für ihre Abhängigkeiten zu versehen.

export interface TrpcMiddlewareFunction {
	// Die Signatur einer tRPC-Middleware
	// biome-ignore lint/style/useShorthandFunctionType: <explanation>
	(opts: {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		ctx: any;
		// biome-ignore lint/complexity/noBannedTypes: <explanation>
		next: Function;
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		input?: any;
		path: string;
		type: "query" | "mutation" | "subscription";
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	}): any;
}

// Definiert, wie eine Middleware im Decorator referenziert wird.
// Entweder ein direkter Verweis auf eine Middleware-Funktion (einfach)
// oder ein Verweis auf einen NestJS-Provider, der die Middleware-Logik enthält (komplexer für den Generator).
export type TrpcMiddlewareDefinition =
	| TrpcMiddlewareFunction // Direkte Funktion (einfach für den Generator, schwer mit DI)
	| {
			// biome-ignore lint/complexity/noBannedTypes: <explanation>
			provider: Function; // NestJS Provider-Klasse (z.B. RoleMiddlewareService)
			methodName: string; // Methode auf dem Provider, die die tRPC-Middleware-Logik enthält
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			params?: any[]; // Optionale statische Parameter für die Middleware
	  };

// Beispiel für eine direkt nutzbare tRPC Middleware (ohne NestJS DI für sich selbst)
// Diese kann im @TrpcProcedure({ middlewares: [someTrpcMiddleware] }) verwendet werden.
export const someTrpcMiddleware: TrpcMiddlewareFunction = ({ ctx, next }) => {
	console.log("Executing someTrpcMiddleware");
	// Hier könnte Logik stehen, die ctx modifiziert oder Fehler wirft
	return next({ ctx });
};
