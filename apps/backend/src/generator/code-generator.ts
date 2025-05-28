// ignore this whole file from biome
import * as path from "node:path";
import * as fs from "fs-extra";
import {
	type Decorator,
	type EnumDeclaration,
	Node,
	Project,
	type PropertyAssignment,
	type SourceFile,
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

interface DeclarationInfo {
	code: string;
	dependencies: Set<string>; // Set of keys (filePath#name)
	sourceFilePath: string;
	name: string;
}

interface ExternalImportDetails {
	defaultImport?: string;
	namespaceImport?: string;
	namedImports: Set<string>;
}

export class TrpcContractGenerator {
	private project: Project;
	private backendSrcPath: string;
	private contractGeneratedRouterFile: string;
	private contractTrpcContextImportPath: string;

	private collectedDeclarationInfo = new Map<string, DeclarationInfo>();
	private visitedDeclarations = new Set<string>();
	private collectedExternalImports = new Map<string, ExternalImportDetails>();

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

	private cleanExportKeyword(text: string): string {
		return text.replace(/^export\s+/gm, "");
	}

	private isExternalImport(importPath: string): boolean {
		return !importPath.startsWith(".") && !importPath.startsWith("/");
	}

	private processSchemaNodeAndCollectDependencies(
		node: Node | undefined,
		sourceFileWhereNodeIsUsed: SourceFile,
	): string {
		if (!node) {
			return "z.undefined()";
		}

		if (
			(Node.isCallExpression(node) &&
				node.getExpression().getText().startsWith("z.")) ||
			(Node.isPropertyAccessExpression(node) &&
				node.getExpression().getText().startsWith("z."))
		) {
			node.forEachDescendant((descendantNode) => {
				if (Node.isIdentifier(descendantNode)) {
					const identifierText = descendantNode.getText();
					if (identifierText === "z") return;

					const parent = descendantNode.getParent();
					if (
						parent &&
						Node.isPropertyAssignment(parent) &&
						parent.getNameNode() === descendantNode
					) {
						return;
					}
					if (
						parent &&
						Node.isBindingElement(parent) &&
						parent.getNameNode() === descendantNode
					) {
						return;
					}
					if (
						parent &&
						Node.isParameterDeclaration(parent) &&
						parent.getNameNode() === descendantNode
					) {
						return;
					}

					this.resolveAndCollectDependencies(
						descendantNode,
						descendantNode.getSourceFile() ||
							sourceFileWhereNodeIsUsed,
					);
				} else if (Node.isPropertyAccessExpression(descendantNode)) {
					const expression = descendantNode.getExpression();
					if (expression.getText() !== "z") {
						this.resolveAndCollectDependencies(
							descendantNode,
							descendantNode.getSourceFile() ||
								sourceFileWhereNodeIsUsed,
						);
					}
				}
			});
			return node.getText();
		}

		if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node)) {
			this.resolveAndCollectDependencies(node, sourceFileWhereNodeIsUsed);
			return node.getText();
		}

		console.warn(
			`WARN: Unerwarteter Knotentyp '${node.getKindName()}' in processSchemaNodeAndCollectDependencies. Text: ${node.getText().substring(0, 100)}`,
		);
		return node.getText();
	}

	private resolveAndCollectDependencies(
		node: Node,
		sourceFileContext: SourceFile,
	): void {
		const symbol = node.getSymbol();
		if (!symbol) {
			return;
		}

		const declarations = symbol.getDeclarations();
		if (!declarations || declarations.length === 0) {
			return;
		}

		const decl = declarations[0];
		const declSourceFile = decl.getSourceFile();
		const originalDeclName = symbol.getName();
		const declarationKey = `${declSourceFile.getFilePath()}#${originalDeclName}`;

		if (this.visitedDeclarations.has(declarationKey)) {
			return;
		}

		const importDeclaration = decl.getFirstAncestorByKind(
			SyntaxKind.ImportDeclaration,
		);
		if (importDeclaration) {
			const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
			const importedSourceFile =
				importDeclaration.getModuleSpecifierSourceFile();

			let importNameForCollector: string | undefined;
			let isNamespace = false;
			let isDefault = false;

			if (Node.isImportSpecifier(decl)) {
				const originalName = decl.getNameNode().getText();
				const aliasName = decl.getAliasNode()?.getText();
				importNameForCollector = aliasName
					? `${originalName} as ${aliasName}`
					: originalName;
			} else if (Node.isNamespaceImport(decl)) {
				importNameForCollector = decl.getNameNode().getText();
				isNamespace = true;
			} else if (Node.isImportClause(decl) && decl.getDefaultImport()) {
				importNameForCollector = decl.getDefaultImport()?.getText();
				isDefault = true;
			}

			if (this.isExternalImport(moduleSpecifier)) {
				if (!this.collectedExternalImports.has(moduleSpecifier)) {
					this.collectedExternalImports.set(moduleSpecifier, {
						namedImports: new Set(),
					});
				}
				const importDetails =
					// biome-ignore lint/style/noNonNullAssertion: <explanation>
					this.collectedExternalImports.get(moduleSpecifier)!;
				if (importNameForCollector) {
					if (isNamespace)
						importDetails.namespaceImport = importNameForCollector;
					else if (isDefault)
						importDetails.defaultImport = importNameForCollector;
					else importDetails.namedImports.add(importNameForCollector);
				}
				return;
			}

			if (importedSourceFile) {
				let targetDeclName = originalDeclName;
				if (Node.isImportSpecifier(decl)) {
					targetDeclName = decl.getNameNode().getText();
				}

				const exportedSymbol = importedSourceFile
					.getExportSymbols()
					.find((s) => s.getName() === targetDeclName);
				const targetDeclaration = exportedSymbol?.getDeclarations()[0];

				if (Node.isImportClause(decl) && decl.getDefaultImport()) {
					const defaultExportSymbol =
						importedSourceFile.getDefaultExportSymbol();
					const defaultTargetDeclaration =
						defaultExportSymbol?.getDeclarations()[0];
					if (defaultTargetDeclaration) {
						this.resolveAndCollectDependencies(
							defaultTargetDeclaration,
							importedSourceFile,
						);
					} else {
						console.warn(
							`WARN: Konnte Default-Export in ${importedSourceFile.getFilePath()} nicht auflösen.`,
						);
					}
					return;
				}

				if (targetDeclaration) {
					this.resolveAndCollectDependencies(
						targetDeclaration,
						importedSourceFile,
					);
				} else if (!isNamespace) {
					console.warn(
						`WARN: Konnte das exportierte Symbol '${targetDeclName}' in '${importedSourceFile.getFilePath()}' nicht finden für den Import in '${sourceFileContext.getFilePath()}' (Node: ${node.getText()}).`,
					);
				}
				return;
			}
			console.warn(
				`WARN: Konnte die Quelldatei für den lokalen Import '${moduleSpecifier}' nicht finden.`,
			);
			return;
		}

		if (
			Node.isEnumDeclaration(decl) ||
			Node.isTypeAliasDeclaration(decl) ||
			Node.isInterfaceDeclaration(decl) ||
			Node.isVariableDeclaration(decl) ||
			Node.isClassDeclaration(decl) ||
			Node.isPropertyDeclaration(decl)
		) {
			const currentDeclKey = `${declSourceFile.getFilePath()}#${originalDeclName}`;

			if (this.visitedDeclarations.has(currentDeclKey)) return;
			this.visitedDeclarations.add(currentDeclKey);

			let statementNodeToGetTextFrom: Node = decl;
			if (Node.isVariableDeclaration(decl)) {
				statementNodeToGetTextFrom =
					decl.getVariableStatement() ?? decl;
			} else if (Node.isPropertyDeclaration(decl)) {
				if (!decl.isStatic()) {
					console.warn(
						`WARN: Instanz-Property '${originalDeclName}' wird referenziert. Contract generiert typischerweise statische/Top-Level Deklarationen.`,
					);
					this.visitedDeclarations.delete(currentDeclKey);
					return;
				}
			}

			const codeText = this.cleanExportKeyword(
				statementNodeToGetTextFrom.getText(),
			);
			const dependenciesForThisDecl = new Set<string>();

			this.collectInternalDependencies(
				decl,
				declSourceFile,
				dependenciesForThisDecl,
			);

			this.collectedDeclarationInfo.set(currentDeclKey, {
				code: codeText,
				dependencies: dependenciesForThisDecl,
				sourceFilePath: declSourceFile.getFilePath(),
				name: originalDeclName,
			});
		}
	}

	private collectInternalDependencies(
		declarationNode: Node,
		sourceFileOfDeclaration: SourceFile,
		dependenciesSetToPopulate: Set<string>,
	): void {
		let declarationName: string | undefined;

		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		if (typeof (declarationNode as any).getNameNode === "function") {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			const nameNode = (declarationNode as any).getNameNode();
			if (nameNode && typeof nameNode.getText === "function") {
				declarationName = nameNode.getText();
			}
		}
		if (
			!declarationName &&
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			typeof (declarationNode as any).getName === "function"
		) {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			const name = (declarationNode as any).getName();
			if (typeof name === "string") {
				declarationName = name;
			}
		}

		declarationNode.forEachDescendant((descendantNode) => {
			if (Node.isIdentifier(descendantNode)) {
				const idText = descendantNode.getText();
				if (declarationName && idText === declarationName) return;

				if (
					idText === "z" ||
					[
						"string",
						"number",
						"boolean",
						"Date",
						"Promise",
						"Array",
						"Record",
						"Partial",
						"Required",
						"Readonly",
						"any",
						"unknown",
						"void",
						"null",
						"undefined",
						"TRPCContext",
						"ReturnType",
						"InstanceType",
						"Error",
						"Buffer",
					].includes(idText) ||
					(typeof globalThis !== "undefined" && idText in globalThis)
				) {
					return;
				}

				const parent = descendantNode.getParent();
				if (parent) {
					if (
						Node.isPropertyAssignment(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isPropertySignature(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isMethodDeclaration(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isMethodSignature(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isParameterDeclaration(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isBindingElement(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isEnumMember(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
				}

				const idSymbol = descendantNode.getSymbol();
				if (idSymbol) {
					const idDeclarations = idSymbol.getDeclarations();
					if (idDeclarations && idDeclarations.length > 0) {
						const idActualDecl = idDeclarations[0];
						const idDeclSourceFile = idActualDecl.getSourceFile();
						const idDeclOriginalName = idSymbol.getName();
						const depKey = `${idDeclSourceFile.getFilePath()}#${idDeclOriginalName}`;

						dependenciesSetToPopulate.add(depKey);
						this.resolveAndCollectDependencies(
							descendantNode,
							sourceFileOfDeclaration,
						);
					}
				}
			} else if (Node.isPropertyAccessExpression(descendantNode)) {
				const expression = descendantNode.getExpression();
				if (expression.getText() !== "z") {
					this.resolveAndCollectDependencies(
						descendantNode,
						sourceFileOfDeclaration,
					);
				}
			}
			if (Node.isTypeReference(descendantNode)) {
				const typeArgs = descendantNode.getTypeArguments();
				for (const typeArgNode of typeArgs) {
					this.resolveAndCollectDependencies(
						typeArgNode,
						sourceFileOfDeclaration,
					);
				}
			}
		});
	}

	private topologicallySortDeclarations(): string[] {
		const graph = new Map<string, Set<string>>();
		const sortedCode: string[] = [];
		const visitedForSort = new Set<string>();
		const fullySorted = new Set<string>();

		for (const key of this.collectedDeclarationInfo.keys()) {
			graph.set(
				key,
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				this.collectedDeclarationInfo.get(key)!.dependencies,
			);
		}

		const visit = (declKey: string) => {
			if (!this.collectedDeclarationInfo.has(declKey)) {
				return;
			}
			if (fullySorted.has(declKey)) return;
			if (visitedForSort.has(declKey)) {
				console.warn(
					`WARN: Zyklische Abhängigkeit erkannt bei '${declKey}'. Contract könnte unvollständig sein.`,
				);
				return;
			}

			visitedForSort.add(declKey);
			const dependencies = graph.get(declKey) || new Set();
			for (const depKey of dependencies) {
				if (depKey !== declKey) {
					visit(depKey);
				}
			}
			visitedForSort.delete(declKey);
			fullySorted.add(declKey);
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			sortedCode.push(this.collectedDeclarationInfo.get(declKey)!.code);
		};

		for (const key of this.collectedDeclarationInfo.keys()) {
			visit(key);
		}
		return sortedCode;
	}

	public async generateContract(): Promise<void> {
		this.collectedDeclarationInfo.clear();
		this.visitedDeclarations.clear();
		this.collectedExternalImports.clear();

		const sourceFiles = this.project.getSourceFiles();
		const procedures: ExtractedProcedureInfo[] = [];

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
						this.processSchemaNodeAndCollectDependencies(
							inputSchemaNode,
							sourceFile,
						);
					const outputTypeCode = outputSchemaNode
						? this.processSchemaNodeAndCollectDependencies(
								outputSchemaNode,
								sourceFile,
							)
						: undefined;

					const generatedOutputPlaceholder =
						this.generatePlaceholderFromZodNode(
							outputSchemaNode,
							sourceFile,
							0,
						);

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

		const orderedLocalDeclarations = this.topologicallySortDeclarations();
		this.writeContractFile(procedures, orderedLocalDeclarations);
	}

	private generatePlaceholderFromZodNode(
		node: Node | undefined,
		sourceFileContext: SourceFile,
		depth = 0,
	): string {
		if (!node || depth > 4) {
			// Maximale Tiefe beibehalten oder anpassen
			return `undefined /* ${!node ? "Kein Schema-Knoten für Placeholder" : "Maximale Rekursionstiefe erreicht"} */`;
		}

		// **NEU**: Behandlung für Identifier (potenziell lokale Schemas) an den Anfang stellen
		if (Node.isIdentifier(node)) {
			let actualDeclaration: Node | undefined;
			const symbol = node.getSymbol();

			if (symbol) {
				const decls = symbol.getDeclarations();
				if (decls && decls.length > 0) {
					const firstDecl = decls[0];
					if (Node.isImportSpecifier(firstDecl)) {
						const importSpecifier = firstDecl;
						const nameNodeSymbol = importSpecifier
							.getNameNode()
							.getSymbol();
						if (nameNodeSymbol) {
							const targetSymbol =
								nameNodeSymbol.getAliasedSymbol() ??
								nameNodeSymbol;
							actualDeclaration =
								targetSymbol.getDeclarations()[0];
						}
					} else {
						actualDeclaration = firstDecl; // Direkte Deklaration
					}
				}
			}

			if (actualDeclaration) {
				if (Node.isVariableDeclaration(actualDeclaration)) {
					const initializer = actualDeclaration.getInitializer();
					if (initializer) {
						// Wichtig: sourceFileContext für den rekursiven Aufruf ist die Datei der tatsächlichen Deklaration
						return this.generatePlaceholderFromZodNode(
							initializer,
							actualDeclaration.getSourceFile(),
							depth + 1,
						);
					}
				}
				if (Node.isEnumDeclaration(actualDeclaration)) {
					const firstMember = actualDeclaration.getMembers()[0];
					if (firstMember) {
						this.resolveAndCollectDependencies(
							node,
							sourceFileContext,
						);
						return `${actualDeclaration.getName()}.${firstMember.getName()}`;
					}
				}
			}
			// Wenn der Identifier nicht zu einem auflösbaren Schema (Variable mit Initializer) oder Enum führt,
			// Fallback auf den generischen Placeholder für diesen Identifier.
			const nodeText = node.getText().substring(0, 60);
			// console.warn(`Placeholder: Konnte Identifier '${nodeText}' nicht zu bekanntem Schema auflösen. Fallback.`);
			return `undefined /* Placeholder für: ${nodeText.replace(/\*\//g, "*\\/")}*/`;
		}

		if (Node.isCallExpression(node)) {
			const callee = node.getExpression();
			const args = node.getArguments();

			if (Node.isPropertyAccessExpression(callee)) {
				const baseOfCallee = callee.getExpression();
				const methodName = callee.getName();

				if (baseOfCallee.getText() === "z") {
					switch (methodName) {
						case "string":
							return '"PLACEHOLDER_STRING"';
						case "number":
							return "0";
						case "bigint":
							return "0n";
						case "boolean":
							return "false";
						case "date":
							return 'new Date("1970-01-01T00:00:00.000Z").toISOString()';
						case "null":
							return "null";
						case "undefined":
						case "void":
							return "undefined";
						case "any":
						case "unknown":
							return "undefined as any";
						case "literal":
							return args[0]
								? args[0].getText()
								: "undefined /* Defektes z.literal */";
						case "enum":
							if (
								args[0] &&
								Node.isArrayLiteralExpression(args[0])
							) {
								const firstVal = args[0].getElements()[0];
								return firstVal
									? firstVal.getText()
									: '"PLACEHOLDER_ENUM"';
							}
							return '"PLACEHOLDER_ENUM"';
						case "nativeEnum": {
							const enumIdentifierNode = args[0];
							if (
								enumIdentifierNode &&
								Node.isIdentifier(enumIdentifierNode)
							) {
								const enumSymbol =
									enumIdentifierNode.getSymbol();
								const enumDeclarations =
									enumSymbol?.getDeclarations();
								if (
									enumDeclarations?.[0] &&
									Node.isEnumDeclaration(enumDeclarations[0])
								) {
									const enumDecl =
										enumDeclarations[0] as EnumDeclaration;
									const firstMember =
										enumDecl.getMembers()[0];
									if (firstMember) {
										this.resolveAndCollectDependencies(
											enumIdentifierNode,
											sourceFileContext,
										);
										return `${enumDecl.getName()}.${firstMember.getName()}`;
									}
								}
								const enumName = enumIdentifierNode.getText();
								this.resolveAndCollectDependencies(
									enumIdentifierNode,
									sourceFileContext,
								);
								console.warn(
									`WARN: Konnte ersten Member für nativeEnum '${enumName}' nicht sicher bestimmen. Placeholder ist '${enumName}[Object.keys(${enumName})[0]]'.`,
								);
								return `(${enumName} as any)[Object.keys(${enumName})[0]]`;
							}
							return "undefined /* Defektes z.nativeEnum für Placeholder */";
						}
						case "object":
							if (
								args[0] &&
								Node.isObjectLiteralExpression(args[0])
							) {
								let objStr = "{";
								const properties = args[0].getProperties();
								for (let i = 0; i < properties.length; i++) {
									const prop = properties[i];
									if (Node.isPropertyAssignment(prop)) {
										const key = prop
											.getNameNode()
											.getText();
										const valueSchemaNode =
											prop.getInitializer();
										// Wichtig: sourceFileContext hier korrekt weitergeben
										objStr += ` "${key}": ${this.generatePlaceholderFromZodNode(valueSchemaNode, sourceFileContext, depth + 1)}`;
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
						case "tuple":
							if (
								args[0] &&
								Node.isArrayLiteralExpression(args[0])
							) {
								const elements = args[0].getElements();
								let tupleStr = "[";
								for (let i = 0; i < elements.length; i++) {
									tupleStr +=
										this.generatePlaceholderFromZodNode(
											elements[i],
											sourceFileContext,
											depth + 1,
										);
									if (i < elements.length - 1)
										tupleStr += ", ";
								}
								tupleStr += "]";
								return tupleStr;
							}
							return "[] /* Defektes z.tuple */";
						case "union":
						case "discriminatedUnion": {
							const optionsArrayNode =
								methodName === "discriminatedUnion"
									? args[1]
									: args[0];
							if (
								optionsArrayNode &&
								Node.isArrayLiteralExpression(optionsArrayNode)
							) {
								const firstOptionSchema =
									optionsArrayNode.getElements()[0];
								if (firstOptionSchema) {
									return this.generatePlaceholderFromZodNode(
										firstOptionSchema,
										sourceFileContext,
										depth + 1,
									);
								}
							}
							return "undefined as any /* Komplexes z.union/z.discriminatedUnion */";
						}
						case "record":
							return "{}";
						case "lazy":
							if (args[0] && Node.isArrowFunction(args[0])) {
								const body = args[0].getBody();
								return depth < 3
									? this.generatePlaceholderFromZodNode(
											body,
											sourceFileContext,
											depth + 1,
										)
									: "undefined /* Rekursionstiefe für z.lazy erreicht */";
							}
							return "undefined as any /* Komplexes z.lazy */";
						default:
							break;
					}
				}

				switch (methodName) {
					case "optional":
						return "undefined";
					case "nullable":
						return "null";
					case "default":
						return this.generatePlaceholderFromZodNode(
							baseOfCallee,
							sourceFileContext,
							depth + 1,
						);
					case "transform":
					case "pipe":
						console.warn(
							`Placeholder für Zod-Effekt '${methodName}' wird zu 'undefined as any'. Das .output() im Vertrag ist aber korrekt.`,
						);
						return "undefined as any";
					case "refine":
					case "superRefine":
						return this.generatePlaceholderFromZodNode(
							baseOfCallee,
							sourceFileContext,
							depth + 1,
						);
					default:
						break;
				}
			}
			const schemaText =
				node?.getText().substring(0, 60) || "Unbekannter Knoten";
			console.warn(
				`Generiere generischen Placeholder für Zod CallExpression AST Knoten: ${node?.getKindName()}, Text: ${schemaText}...`,
			);
			return "undefined as any /* Komplexes/Unbekanntes Zod-Schema für Placeholder-Wert */";
		}

		// Fallback für Knoten, die keine Identifier oder CallExpressions sind (sollte selten sein für Schemas)
		const nodeText =
			node?.getText().substring(0, 60) || "Unbekannter Knoten";
		// console.warn(`Generiere generischen Placeholder für AST Knoten (Typ: ${node?.getKindName()}): ${nodeText}`);
		return `undefined /* Placeholder für: ${nodeText.replace(/\*\//g, "*\\/")}*/`;
	}

	private writeContractFile(
		procedures: ExtractedProcedureInfo[],
		orderedLocalDeclarations: string[],
	): void {
		let code = "// AUTOGENERATED FILE - DO NOT EDIT MANUALLY\n\n";
		code += "import { initTRPC, TRPCError } from '@trpc/server';\n";
		code += "import { z } from 'zod';\n";
		code += `import type { TRPCContext } from '${this.contractTrpcContextImportPath}';\n\n`;

		if (this.collectedExternalImports.size > 0) {
			code += "// External Imports\n";
			this.collectedExternalImports.forEach(
				(details, moduleSpecifier) => {
					const importParts: string[] = [];
					if (details.defaultImport) {
						importParts.push(details.defaultImport);
					}
					if (details.namespaceImport) {
						importParts.push(`* as ${details.namespaceImport}`);
					}
					if (details.namedImports && details.namedImports.size > 0) {
						importParts.push(
							`{ ${[...details.namedImports].sort().join(", ")} }`,
						);
					}

					if (importParts.length > 0) {
						code += `import ${importParts.join(", ")} from '${moduleSpecifier}';\n`;
					} else {
						code += `import '${moduleSpecifier}';\n`;
					}
				},
			);
			code += "\n";
		}

		if (orderedLocalDeclarations.length > 0) {
			code += "// Local Dependencies (Types, Enums, Schemas)\n";
			code += `${orderedLocalDeclarations.join("\n\n")}\n\n`;
		}

		code += "const t = initTRPC.context<TRPCContext>().create();\n\n";
		code += "export const publicProcedure = t.procedure;\n";
		code +=
			"export const protectedProcedure = t.procedure.use(async (opts) => {\n";
		code += "  return opts.next({ ctx: opts.ctx });\n";
		code += "});\n\n";

		const proceduresByDomain: Record<string, ExtractedProcedureInfo[]> = {};
		// biome-ignore lint/complexity/noForEach: <explanation>
		procedures.forEach((p) => {
			const key = p.domain || "__ROOT__";
			if (!proceduresByDomain[key]) proceduresByDomain[key] = [];
			proceduresByDomain[key].push(p);
		});

		code += "export const appRouter = t.router({\n";
		for (const domain in proceduresByDomain) {
			if (domain === "__ROOT__") {
				// biome-ignore lint/complexity/noForEach: <explanation>
				proceduresByDomain[domain].forEach((p) => {
					code += `  ${p.procedureName}: ${p.isProtected ? "protectedProcedure" : "publicProcedure"}\n`;
					code += `    .input(${p.inputTypeCode})\n`;
					if (p.outputTypeCode) {
						code += `    .output(${p.outputTypeCode})\n`;
					}
					code += `    .${p.trpcType}(({ input, ctx }) => {\n`;
					code += `      return ${p.generatedOutputPlaceholder};\n`;
					code += "    }),\n";
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
					code += `        return ${p.generatedOutputPlaceholder};\n`;
					code += "      }),\n";
				});
				code += "  }),\n";
			}
		}
		code += "});\n\n";
		code += "export type AppRouter = typeof appRouter;\n";

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
