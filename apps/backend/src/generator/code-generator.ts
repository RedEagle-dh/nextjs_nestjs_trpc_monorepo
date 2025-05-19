// ignore this whole file from biome
import * as path from "node:path";
import * as fs from "fs-extra";
import {
	CallExpression,
	ClassDeclaration,
	Decorator,
	MethodDeclaration,
	Node,
	ObjectLiteralExpression,
	Project,
	PropertyAssignment,
	SyntaxKind,
} from "ts-morph";

// Interne Struktur zur Speicherung extrahierter Prozedurinformationen
interface ExtractedProcedureInfo {
	procedureName: string;
	domain?: string;
	trpcType: "query" | "mutation";
	isProtected: boolean;
	inputTypeCode: string;
	outputTypeCode?: string; // Der String für die .output() Direktive
	generatedOutputPlaceholder: string; // Der String für den return-Wert des Placeholders
}

export class TrpcContractGenerator {
	private project: Project;
	private backendSrcPath: string;
	private contractGeneratedRouterFile: string; // Pfad zur zu generierenden Datei
	private contractTrpcContextImportPath: string; // Pfad zum TRPCContext-Typ

	constructor(config: {
		backendSrcDir: string;
		backendTsConfig: string;
		outputContractFile: string;
		trpcContextImportPath?: string; // z.B. './trpc-context' oder '@n2-monorepo/trpc-contract'
	}) {
		this.backendSrcPath = config.backendSrcDir;
		this.contractGeneratedRouterFile = config.outputContractFile;
		this.contractTrpcContextImportPath =
			config.trpcContextImportPath || "./trpc-context"; // Default

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
					// Wir nehmen den Text des Initializers. Das sollte z.B. "z.object({ ... })" sein.
					// Der Generator muss sicherstellen, dass 'z' in der generierten Datei verfügbar ist.
					return initializer.getText();
				}
			}
		}
		return undefined;
	}

	public async generateContract(): Promise<void> {
		const procedures: ExtractedProcedureInfo[] = []; // ExtractedProcedureInfo enthält generatedOutputPlaceholder
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

					let isProtected = false; // Standardwert
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
					const outputTypeCode = outputSchemaNode?.getText(); // Dieser Code-String ist für die .output() Direktive

					// Generiere den Placeholder String basierend auf dem AST-Knoten des Output-Schemas
					const generatedOutputPlaceholder =
						this.generatePlaceholderFromZodNode(outputSchemaNode);

					// Hier wird das fehlende Feld hinzugefügt:
					procedures.push({
						procedureName,
						domain,
						trpcType,
						isProtected,
						inputTypeCode,
						outputTypeCode, // Für die .output() Direktive
						generatedOutputPlaceholder, // <<< KORREKTUR HIER
					});
				}
			}
		}
		this.writeContractFile(procedures); // Aufruf bleibt gleich
	}

	private generatePlaceholderFromZodNode(
		node: Node | undefined,
		depth = 0,
	): string {
		if (!node || depth > 5) {
			// Schutz vor zu tiefer Rekursion
			return `undefined /* ${!node ? "Kein Schema-Knoten für Placeholder" : "Maximale Rekursionstiefe erreicht"} */`;
		}

		// z.string(), z.number(), etc. sind CallExpressions auf PropertyAccessExpressions (z.B. z.string)
		if (Node.isCallExpression(node)) {
			const expression = node.getExpression(); // Der Teil vor den Klammern ()

			if (Node.isPropertyAccessExpression(expression)) {
				// z.B. z.string, z.object, z.array
				const baseObjectText = expression.getExpression().getText(); // Sollte 'z' sein
				const methodName = expression.getName(); // z.B. "string", "object", "array"

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
							// Ein valider ISO-String als Placeholder
							return `'${new Date(0).toISOString()}'`; // Oder "new Date().toISOString()" für Dynamik
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
						case "enum": // z.enum(['A', 'B'])
						case "nativeEnum": // z.nativeEnum(MyEnum)
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
							// Für nativeEnums ist es komplexer, den ersten Wert zu bekommen.
							return '"PLACEHOLDER_ENUM"'; // Fallback
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
											.getText(); // Sicherer Weg, den Schlüsselnamen zu bekommen
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
							// Für den Placeholder reicht oft ein leeres Array.
							// Um typsicher zu sein, könnte man ein Element generieren:
							// const elementSchemaNode = node.getArguments()[0];
							// return `[${this.generatePlaceholderFromZodNode(elementSchemaNode, depth + 1)}]`;
							return "[]";
						// Hier weitere Zod-Typen hinzufügen: tuple, union, discriminatedUnion, record, map, set, etc.
						// Optional, Nullable, Default (werden oft als chained methods behandelt)
					}
				}
			}
		} else if (Node.isPropertyAccessExpression(node)) {
			// Behandelt Chained Methods wie .optional()
			const expressionText = node.getText(); // z.B. "z.string().optional()"
			const baseExpression = node.getExpression(); // Der Teil vor dem .methodName()
			const methodName = node.getName(); // z.B. "optional", "nullable", "default"

			if (methodName === "optional" || methodName === "nullable") {
				// Für optionale/nullable Felder ist undefined ein valider Placeholder
				return "undefined";
			}
			if (methodName === "default") {
				// Für .default(), den Placeholder für den inneren Typ generieren
				return this.generatePlaceholderFromZodNode(
					baseExpression,
					depth + 1,
				);
			}
			// Falls es ein direkter Identifier ist (z.B. eine Schema-Variable), wird es komplexer.
			// Für den MVP fokussieren wir uns auf inline z.method() Aufrufe.
		}

		// Fallback für nicht direkt behandelte oder komplexe Zod-Strukturen
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
					code += `      console.warn("tRPC contract placeholder for '<span class="math-inline">\{p\.domain ? p\.domain \+ '\.' \: ''\}</span>{p.procedureName}' called.");\n`;
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
					code += `        console.warn("tRPC contract placeholder for '${domain}.${p.procedureName}' called.");\n`;
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
			// Wichtig: getInitializer() gibt den Node der rechten Seite der Zuweisung zurück
			return optionProperty?.getInitializer();
		}
		return undefined;
	}
}
