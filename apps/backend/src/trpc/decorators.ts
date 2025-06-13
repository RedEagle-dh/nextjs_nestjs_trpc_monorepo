import type { TRPCContext } from "@mono/database";
import { ZodSchema } from "zod";

export const TRPC_ROUTER_KEY = Symbol("TRPC_ROUTER_KEY");
export const TRPC_PROCEDURE_KEY = Symbol("TRPC_PROCEDURE_KEY");
export const TRPC_MIDDLEWARE_KEY = Symbol("TRPC_MIDDLEWARE_KEY");

export interface TrpcRouterMetadata {
	domain?: string;
}

export interface TrpcProcedureOptions<
	TInputSchema extends ZodSchema | undefined = undefined,
	TOutputSchema extends ZodSchema | undefined = undefined,
> {
	inputType?: TInputSchema;
	outputType?: TOutputSchema;
	type: "query" | "mutation";
	isProtected?: boolean;
	middlewares?: TrpcMiddlewareDefinition[];
}

export type TrpcProcedureInput<TInputSchema extends ZodSchema | undefined> =
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	TInputSchema extends ZodSchema<infer T, any, any> ? T : undefined;

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
			options: optionsArgument,
			implementation: descriptor.value,
		};

		procedures.push(procedureDefinitionToStore);
		Reflect.defineMetadata(
			TRPC_PROCEDURE_KEY,
			procedures,
			target.constructor,
		);
	};
}

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
