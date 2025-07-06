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

export type TrpcProcedureOutput<TOutputSchema extends ZodSchema | undefined> =
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	TOutputSchema extends ZodSchema<infer T, any, any> ? T : undefined;

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
 * Type-safe decorator with automatic return type inference.
 * The method signature is automatically constrained based on the decorator options.
 *
 * For queries without input:
 * @TrpcProcedure({ outputType: z.string(), type: "query" })
 * myMethod() { return "hello"; } // TypeScript enforces string return type
 *
 * For mutations with input:
 * @TrpcProcedure({ inputType: z.object({msg: z.string()}), outputType: z.string(), type: "mutation" })
 * myMethod(params) { return params.input.msg; } // TypeScript enforces correct parameter and return types
 */
export function TrpcProcedure<TOutputSchema extends ZodSchema>(options: {
	outputType: TOutputSchema;
	type: "query" | "mutation";
	isProtected?: boolean;
	middlewares?: TrpcMiddlewareDefinition[];
}): <T extends () => TrpcProcedureOutput<TOutputSchema>>(
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	target: any,
	propertyKey: string | symbol,
	descriptor: TypedPropertyDescriptor<T>,
) => TypedPropertyDescriptor<T>;

export function TrpcProcedure<
	TInputSchema extends ZodSchema,
	TOutputSchema extends ZodSchema,
>(options: {
	inputType: TInputSchema;
	outputType: TOutputSchema;
	type: "query" | "mutation";
	isProtected?: boolean;
	middlewares?: TrpcMiddlewareDefinition[];
}): <
	T extends (
		params: TrpcProcedureParameters<TInputSchema>,
	) => TrpcProcedureOutput<TOutputSchema>,
>(
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	target: any,
	propertyKey: string | symbol,
	descriptor: TypedPropertyDescriptor<T>,
) => TypedPropertyDescriptor<T>;

export function TrpcProcedure<
	TInputSchema extends ZodSchema | undefined = undefined,
	TOutputSchema extends ZodSchema | undefined = undefined,
>(optionsArgument: TrpcProcedureOptions<TInputSchema, TOutputSchema>) {
	// biome-ignore lint/suspicious/noExplicitAny: TypeScript decorators require any types for flexible method signatures
	return <T extends (...args: any[]) => any>(
		// biome-ignore lint/suspicious/noExplicitAny: TypeScript decorator target parameter requires any type
		target: any,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<T>,
	): TypedPropertyDescriptor<T> => {
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

		return descriptor;
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
