// ignore this whole file from biome
import * as path from "node:path";
import * as fs from "fs-extra";
import {
	Decorator,
	Node,
	Project,
	PropertyAssignment,
	SyntaxKind,
} from "ts-morph";

interface ExtractedProcedureInfo {
	procedureName: string;
	domain?: string;
	trpcType: "query" | "mutation";
	isProtected: boolean;
	inputTypeCode: string;
	outputTypeCode?: string;
	generatedOutputPlaceholder: string;
}

export class TrpcContractGenerator {
	private project: Project;
	private backendSrcPath: string;
	private contractGeneratedRouterFile: string;
	private contractTrpcContextImportPath: string;

	constructor(config: {
		backendSrcDir: string;
		backendTsConfig: string;
		outputContractFile: string;
		trpcContextImportPath?: string;
	}) {
		this.backendSrcPath = config.backendSrcDir;
		this.contractGeneratedRouterFile = config.outputContractFile;
		this.contractTrpcContextImportPath =
			config.trpcContextImportPath || "./trpc-context";

		this.project = new Project({
			tsConfigFilePath: config.backendTsConfig,
		});
		this.project.addSourceFilesAtPaths(`${this.backendSrcPath}/**/*.ts`);
	}

	private getSchemaCodeFromDecoratorOption(
		decorator: Decorator,
		optionName: "inputType" | "outputType",
	): string | undefined {
		const decoratorArg = decorator.getArguments()[0];
		if (decoratorArg && Node.isObjectLiteralExpression(decoratorArg)) {
			const optionProperty = decoratorArg.getProperty(optionName);
			if (optionProperty && Node.isPropertyAssignment(optionProperty)) {
				const initializer = optionProperty.getInitializer();
				if (initializer) {
					return initializer.getText();
				}
			}
		}
		return undefined;
	}

	public async generateContract(): Promise<void> {
		const procedures: ExtractedProcedureInfo[] = [];
		const sourceFiles = this.project.getSourceFiles();

		for (const sourceFile of sourceFiles) {
			const classes = sourceFile.getClasses();
			for (const classDeclaration of classes) {
				const routerDecorator =
					classDeclaration.getDecorator("TrpcRouter");
				if (!routerDecorator) continue;

				let domain: string | undefined;
				const routerDecoratorArg = routerDecorator.getArguments()[0];
				if (
					routerDecoratorArg &&
					Node.isObjectLiteralExpression(routerDecoratorArg)
				) {
					const domainProperty = routerDecoratorArg.getProperty(
						"domain",
					) as PropertyAssignment | undefined;
					if (domainProperty) {
						const initializer = domainProperty.getInitializerIfKind(
							SyntaxKind.StringLiteral,
						);
						if (initializer) domain = initializer.getLiteralText();
					}
				}

				for (const method of classDeclaration.getMethods()) {
					const procDecorator = method.getDecorator("TrpcProcedure");
					if (!procDecorator) continue;

					const procedureName = method.getName();
					const procDecoratorArg = procDecorator.getArguments()[0];
					if (
						!procDecoratorArg ||
						!Node.isObjectLiteralExpression(procDecoratorArg)
					)
						continue;

					const typeProperty = procDecoratorArg.getProperty("type") as
						| PropertyAssignment
						| undefined;
					const isProtectedProperty = procDecoratorArg.getProperty(
						"isProtected",
					) as PropertyAssignment | undefined;

					const trpcType = typeProperty
						?.getInitializerIfKind(SyntaxKind.StringLiteral)
						?.getLiteralText() as "query" | "mutation";

					let isProtected = false;
					if (isProtectedProperty) {
						const initializer =
							isProtectedProperty.getInitializer();
						if (
							initializer &&
							initializer.getKind() === SyntaxKind.TrueKeyword
						) {
							isProtected = true;
						}
					}

					if (!trpcType) {
						console.warn(
							`Procedure '${procedureName}' in '${classDeclaration.getName()}' is missing 'type'. Skipping.`,
						);
						continue;
					}

					const inputSchemaNode = this.getZodSchemaInitializerNode(
						procDecorator,
						"inputType",
					);
					const outputSchemaNode = this.getZodSchemaInitializerNode(
						procDecorator,
						"outputType",
					);

					const inputTypeCode =
						inputSchemaNode?.getText() || "z.undefined()";
					const outputTypeCode = outputSchemaNode?.getText();

					const generatedOutputPlaceholder =
						this.generatePlaceholderFromZodNode(outputSchemaNode);

					procedures.push({
						procedureName,
						domain,
						trpcType,
						isProtected,
						inputTypeCode,
						outputTypeCode,
						generatedOutputPlaceholder,
					});
				}
			}
		}
		this.writeContractFile(procedures);
	}

	private generatePlaceholderFromZodNode(
		node: Node | undefined,
		depth = 0,
	): string {
		if (!node || depth > 5) {
			return `undefined /* ${!node ? "Kein Schema-Knoten für Placeholder" : "Maximale Rekursionstiefe erreicht"} */`;
		}

		if (Node.isCallExpression(node)) {
			const expression = node.getExpression();

			if (Node.isPropertyAccessExpression(expression)) {
				const baseObjectText = expression.getExpression().getText();
				const methodName = expression.getName();

				if (baseObjectText === "z") {
					switch (methodName) {
						case "string":
							return '"PLACEHOLDER_STRING"';
						case "number":
						case "bigint":
							return "0";
						case "boolean":
							return "false";
						case "date":
							return `'${new Date(0).toISOString()}'`;
						case "null":
							return "null";
						case "undefined":
						case "void":
							return "undefined";
						case "literal":
							// biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
							const literalArg = node.getArguments()[0];
							return literalArg
								? literalArg.getText()
								: "undefined /* Defektes z.literal */";
						case "enum":
						case "nativeEnum":
							// biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
							const enumArgs = node.getArguments()[0];
							if (
								enumArgs &&
								Node.isArrayLiteralExpression(enumArgs)
							) {
								const firstVal = enumArgs.getElements()[0];
								return firstVal
									? firstVal.getText()
									: '"PLACEHOLDER_ENUM"';
							}
							return '"PLACEHOLDER_ENUM"';
						case "object":
							// biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
							const objectArg = node.getArguments()[0];
							if (
								objectArg &&
								Node.isObjectLiteralExpression(objectArg)
							) {
								let objStr = "{";
								const properties = objectArg.getProperties();
								for (let i = 0; i < properties.length; i++) {
									const prop = properties[i];
									if (Node.isPropertyAssignment(prop)) {
										const key = prop
											.getNameNode()
											.getText();
										const valueSchemaNode =
											prop.getInitializer();
										objStr += ` "${key}": ${this.generatePlaceholderFromZodNode(valueSchemaNode, depth + 1)}`;
										if (i < properties.length - 1)
											objStr += ",";
									}
								}
								objStr += " }";
								return objStr;
							}
							return "{ /* Defektes z.object für Placeholder */ }";
						case "array":
							return "[]";
					}
				}
			}
		} else if (Node.isPropertyAccessExpression(node)) {
			const baseExpression = node.getExpression();
			const methodName = node.getName();

			if (methodName === "optional" || methodName === "nullable") {
				return "undefined";
			}
			if (methodName === "default") {
				return this.generatePlaceholderFromZodNode(
					baseExpression,
					depth + 1,
				);
			}
		}

		const schemaText = node?.getText().substring(0, 50) || "Unbekannt";
		console.warn(
			`Generiere 'undefined as any' für Zod AST Knoten Typ: ${node?.getKindName()}, Text: ${schemaText}...`,
		);
		return "undefined as any; /* Komplexes/Unbekanntes Zod-Schema für Placeholder */";
	}

	private writeContractFile(procedures: ExtractedProcedureInfo[]): void {
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		let code = `// AUTOGENERATED FILE - DO NOT EDIT MANUALLY\n\n`;
		code += `import { initTRPC, TRPCError } from '@trpc/server';\n`;
		code += `import { z } from 'zod';\n`; // Zod wird für die inline Schemas benötigt
		code += `import type { TRPCContext } from '${this.contractTrpcContextImportPath}';\n\n`;

		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `const t = initTRPC.context<TRPCContext>().create();\n\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `export const publicProcedure = t.procedure;\n`;
		// Der Contract-Placeholder für protectedProcedure. Die echte Logik ist im Backend.
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `export const protectedProcedure = t.procedure.use(async (opts) => {\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `  // This middleware is a placeholder for the generated contract.\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `  // Actual authentication and authorization logic resides in the backend.\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `  // It ensures that procedures marked as protected in the contract\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `  // are recognizable as such by the tRPC client and type system.\n`;
		code += `  if (!opts.ctx.user && opts.path !== 'healthcheck') { /* Example to allow healthcheck */ \n`;
		code += `    // console.warn(\`[tRPC Contract] Protected procedure '\${opts.path}' called without user context.\`);\n`;
		code += `    // throw new TRPCError({ code: 'UNAUTHORIZED' }); // Optional: make contract stricter\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `  }\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `  return opts.next({ ctx: opts.ctx });\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `});\n\n`;

		const proceduresByDomain: Record<string, ExtractedProcedureInfo[]> = {};
		// biome-ignore lint/complexity/noForEach: <explanation>
		procedures.forEach((p) => {
			const key = p.domain || "__ROOT__";
			if (!proceduresByDomain[key]) proceduresByDomain[key] = [];
			proceduresByDomain[key].push(p);
		});
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `export const appRouter = t.router({\n`;
		for (const domain in proceduresByDomain) {
			if (domain === "__ROOT__") {
				// biome-ignore lint/complexity/noForEach: <explanation>
				proceduresByDomain[domain].forEach((p) => {
					code += `  ${p.procedureName}: ${p.isProtected ? "protectedProcedure" : "publicProcedure"}\n`;
					code += `    .input(${p.inputTypeCode})\n`; // Direkte Verwendung des extrahierten Schema-Codes
					if (p.outputTypeCode) {
						code += `    .output(${p.outputTypeCode})\n`; // Verwende den extrahierten Output-Schema-Code
					}
					code += `    .${p.trpcType}(({ input, ctx }) => {\n`;
					code += `      return ${p.generatedOutputPlaceholder};\n`; // HIER DIE ÄNDERUNG
					// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
					code += `    }),\n`;
				});
			} else {
				code += `  ${domain}: t.router({\n`;
				// biome-ignore lint/complexity/noForEach: <explanation>
				proceduresByDomain[domain].forEach((p) => {
					code += `    ${p.procedureName}: ${p.isProtected ? "protectedProcedure" : "publicProcedure"}\n`;
					code += `      .input(${p.inputTypeCode})\n`;
					if (p.outputTypeCode) {
						code += `      .output(${p.outputTypeCode})\n`;
					}
					code += `      .${p.trpcType}(({ input, ctx }) => {\n`;
					code += `        return ${p.generatedOutputPlaceholder}\n`;
					// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
					code += `      }),\n`;
				});
				// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
				code += `  }),\n`;
			}
		}
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `});\n\n`;
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		code += `export type AppRouter = typeof appRouter;\n`;

		fs.ensureDirSync(path.dirname(this.contractGeneratedRouterFile));
		fs.writeFileSync(this.contractGeneratedRouterFile, code);
		console.log(
			`✅ tRPC contract generated at ${this.contractGeneratedRouterFile}`,
		);
	}

	private getZodSchemaInitializerNode(
		decorator: Decorator,
		optionName: "inputType" | "outputType",
	): Node | undefined {
		const decoratorArg = decorator.getArguments()[0];
		if (decoratorArg && Node.isObjectLiteralExpression(decoratorArg)) {
			const optionProperty = decoratorArg.getProperty(optionName) as
				| PropertyAssignment
				| undefined;
			return optionProperty?.getInitializer();
		}
		return undefined;
	}
}
