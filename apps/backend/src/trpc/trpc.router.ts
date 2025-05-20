import { TRPCContext } from "@mono/trpc-server/dist/server";
// src/trpc/trpc-main.router.ts (MVP-Implementierung)
import { Injectable, OnModuleInit, Type } from "@nestjs/common";
import { ModuleRef, ModulesContainer } from "@nestjs/core";
import { AnyRouter, TRPCError, initTRPC } from "@trpc/server";
import { ZodType, z } from "zod"; // Zod importieren
import {
	TRPC_PROCEDURE_KEY,
	TRPC_ROUTER_KEY,
	TrpcProcedureOptions,
} from "./decorators";

const t = initTRPC.context<TRPCContext>().create();

@Injectable()
export class MainTrpcRouterFactory implements OnModuleInit {
	private appRouterInstance!: AnyRouter;

	constructor(
		private readonly moduleRef: ModuleRef,
		private readonly modulesContainer: ModulesContainer,
	) {}

	onModuleInit() {
		this.appRouterInstance = this._buildAppRouter();
		if (Object.keys(this.appRouterInstance._def.procedures).length > 0) {
			console.log(
				`✅ Backend tRPC Router built with procedures: ${Object.keys(this.appRouterInstance._def.procedures).join(", ")}`,
			);
		} else {
			console.warn(
				"⚠️ Backend tRPC Router built, but no procedures were found/registered!",
			);
		}
	}

	public getAppRouter(): AnyRouter {
		if (!this.appRouterInstance) {
			console.warn(
				"AppRouter not yet built, building now (should have happened in onModuleInit).",
			);
			this.appRouterInstance = this._buildAppRouter();
		}
		return this.appRouterInstance;
	}

	private _buildAppRouter(): AnyRouter {
		const proceduresToBuildGrouped: Record<
			string,
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			Record<string, any>
		> = {};

		const modules = [...this.modulesContainer.values()];
		for (const nestModule of modules) {
			const providers = [...nestModule.providers.values()];
			for (const wrapper of providers) {
				const metatype = wrapper.metatype;
				if (
					!metatype ||
					typeof metatype !== "function" ||
					!wrapper.instance
				) {
					continue;
				}

				const routerMetadata = Reflect.getMetadata(
					TRPC_ROUTER_KEY,
					metatype,
				);
				if (!routerMetadata) {
					continue;
				}

				const routerInstance = wrapper.instance;
				const domain = routerMetadata.domain as string | undefined;
				const procedureDefinitionsFromMetadata =
					Reflect.getMetadata(TRPC_PROCEDURE_KEY, metatype) || [];

				const domainKey = domain || "__ROOT__";
				if (!proceduresToBuildGrouped[domainKey]) {
					proceduresToBuildGrouped[domainKey] = {};
				}

				for (const procDefFromMeta of procedureDefinitionsFromMetadata) {
					const methodName = procDefFromMeta.methodName as string;
					const options =
						procDefFromMeta.options as TrpcProcedureOptions<
							// biome-ignore lint/suspicious/noExplicitAny: <explanation>
							ZodType<any, any, any>,
							// biome-ignore lint/suspicious/noExplicitAny: <explanation>
							ZodType<any, any, any>
						>;
					const implementation =
						// biome-ignore lint/complexity/noBannedTypes: <explanation>
						procDefFromMeta.implementation as Function;

					if (typeof implementation !== "function") {
						continue;
					}

					let procedureBuilder = options.isProtected
						? t.procedure.use(async (opts) => {
								if (!opts.ctx.user) {
									throw new TRPCError({
										code: "UNAUTHORIZED",
									});
								}
								return opts.next({ ctx: opts.ctx });
							})
						: t.procedure;

					if (options.inputType) {
						procedureBuilder = procedureBuilder.input(
							options.inputType,
						);
					}
					if (options.outputType) {
						procedureBuilder = procedureBuilder.output(
							options.outputType,
						);
					}

					const boundImplementation =
						implementation.bind(routerInstance);
					const resolver = async (opts: {
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						input: any;
						ctx: TRPCContext;
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						meta?: any;
					}) => {
						try {
							if (boundImplementation.length === 0)
								return await boundImplementation();
							if (boundImplementation.length === 1)
								return await boundImplementation(opts.input);
							return await boundImplementation(
								opts.input,
								opts.ctx,
							);
						} catch (error) {
							if (error instanceof TRPCError) throw error;
							const procedurePath = `${
								// biome-ignore lint/style/useTemplate: <explanation>
								domainKey !== "__ROOT__" ? domainKey + "." : ""
							}${methodName}`;
							console.error(
								`Error in tRPC procedure ${procedurePath}:`,
								error,
							);
							throw new TRPCError({
								code: "INTERNAL_SERVER_ERROR",
								message: `An unexpected error occurred in ${procedurePath}.`,
								cause: error,
							});
						}
					};

					// biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
					let finalProcedure;
					if (options.type === "query") {
						finalProcedure = procedureBuilder.query(resolver);
					} else if (options.type === "mutation") {
						finalProcedure = procedureBuilder.mutation(resolver);
					} else {
						continue;
					}

					if (proceduresToBuildGrouped[domainKey][methodName]) {
						console.warn(
							`Procedure collision: ${domainKey}.${methodName} from class ${metatype.name} is overwriting a previously defined procedure for this domain.`,
						);
					}
					proceduresToBuildGrouped[domainKey][methodName] =
						finalProcedure;
				}
			}
		}

		const finalRouterDefinition = {};

		for (const domainKey in proceduresToBuildGrouped) {
			const proceduresInDomain = proceduresToBuildGrouped[domainKey];
			if (Object.keys(proceduresInDomain).length === 0) {
				if (domainKey !== "__ROOT__") {
					console.warn(
						`Domain '${domainKey}' has no procedures defined after processing all providers, skipping.`,
					);
				}
				continue;
			}

			if (domainKey === "__ROOT__") {
				Object.assign(finalRouterDefinition, proceduresInDomain);
			} else {
				finalRouterDefinition[domainKey] = t.router(proceduresInDomain);
				console.log(
					`Created domain router '${domainKey}' with procedures: ${Object.keys(proceduresInDomain).join(", ")}`,
				);
			}
		}
		if (
			Object.keys(finalRouterDefinition).length === 0 &&
			// biome-ignore lint/complexity/useLiteralKeys: <explanation>
			Object.keys(proceduresToBuildGrouped["__ROOT__"] || {}).length === 0
		) {
			console.warn(
				"No root procedures or domain routers were built. The appRouter will be empty.",
			);
		}

		return t.router(finalRouterDefinition);
	}
}
