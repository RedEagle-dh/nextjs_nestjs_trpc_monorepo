// Stelle sicher, dass der Pfad zu deinem TRPCContext korrekt ist!
import type { TRPCContext } from "@mono/trpc-server/dist/server";
// decorators.ts
import { ZodSchema, ZodTypeDef, z } from "zod";

export const TRPC_ROUTER_KEY = Symbol("TRPC_ROUTER_KEY");
export const TRPC_PROCEDURE_KEY = Symbol("TRPC_PROCEDURE_KEY");
export const TRPC_MIDDLEWARE_KEY = Symbol("TRPC_MIDDLEWARE_KEY"); // Beibehalten, falls du es noch verwendest

// TrpcRouterMetadata bleibt gleich
export interface TrpcRouterMetadata {
	domain?: string;
}

// TrpcProcedureOptions mit klareren Generic-Namen
export interface TrpcProcedureOptions<
	TInputSchema extends ZodSchema | undefined = undefined,
	TOutputSchema extends ZodSchema | undefined = undefined,
> {
	inputType?: TInputSchema;
	outputType?: TOutputSchema;
	type: "query" | "mutation";
	isProtected?: boolean;
	middlewares?: TrpcMiddlewareDefinition[]; // Beibehalten
}

// NEU: Helper-Typ für die Parameter der dekorierten Methode
// Leitet den Typ des 'input'-Parameters aus dem Zod-Schema ab.
export type TrpcProcedureInput<TInputSchema extends ZodSchema | undefined> =
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	TInputSchema extends ZodSchema<infer T, any, any> ? T : undefined;
// Wenn inputType nicht definiert ist, ist input 'undefined'.
// Alternativ könntest du 'unknown' verwenden, wenn das für deinen Flow besser passt.

export type TrpcProcedureParameters<
	TInputSchema extends ZodSchema | undefined,
> = {
	ctx: TRPCContext;
	input: TrpcProcedureInput<TInputSchema>;
};

/**
 * Kennzeichnet eine NestJS-Provider-Klasse als Quelle für tRPC-Router-Definitionen.
 */
export function TrpcRouter(metadata?: TrpcRouterMetadata): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(TRPC_ROUTER_KEY, metadata || {}, target);
	};
}

/**
 * Kennzeichnet eine Methode innerhalb einer @TrpcRouter()-Klasse als tRPC-Prozedur.
 */
export function TrpcProcedure<
	TInputSchema extends ZodSchema | undefined, // Generic für inputType
	TOutputSchema extends ZodSchema | undefined, // Generic für outputType
>(
	optionsArgument: TrpcProcedureOptions<TInputSchema, TOutputSchema>,
): MethodDecorator {
	return (
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		target: any,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const procedures =
			Reflect.getMetadata(TRPC_PROCEDURE_KEY, target.constructor) || [];

		const procedureDefinitionToStore = {
			methodName: propertyKey,
			options: optionsArgument, // Das gesamte options-Objekt speichern
			implementation: descriptor.value, // Die ursprüngliche Methodenimplementierung
		};

		procedures.push(procedureDefinitionToStore);
		Reflect.defineMetadata(
			TRPC_PROCEDURE_KEY,
			procedures,
			target.constructor,
		);
	};
}

// ----- Middleware-Definitionen (unverändert von deinem Code) -----
export interface TrpcMiddlewareFunction {
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

export type TrpcMiddlewareDefinition =
	| TrpcMiddlewareFunction
	| {
			// biome-ignore lint/complexity/noBannedTypes: <explanation>
			provider: Function;
			methodName: string;
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			params?: any[];
	  };

export const someTrpcMiddleware: TrpcMiddlewareFunction = ({ ctx, next }) => {
	return next({ ctx });
};
