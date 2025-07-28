// ignore this whole file from biome
import path from "node:path";
import fs from "fs-extra";
import {
	type Decorator,
	type EnumDeclaration,
	Node,
	Project,
	type PropertyAccessExpression,
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
	dependencies: Set<string>;
	sourceFilePath: string;
	name: string;
}

interface ExternalImportDetails {
	defaultImport?: string;
	namespaceImport?: string;
	namedImports: Set<string>;
}

interface TrpcContractGeneratorConfig {
	backendSrcDir: string;
	backendTsConfig: string;
	outputContractFile: string;
	trpcContextImportPath?: string;
	zenstackRouterImportPath: string;
	importMappings?: Record<string, string>;
}

export class TrpcContractGenerator {
	private project: Project;
	private backendSrcPath: string;
	private contractGeneratedRouterFile: string;
	private contractTrpcContextImportPath: string;
	private zenstackRouterImportPath: string;
	private importMappings: Record<string, string>;
	private debugMode = false;

	private collectedDeclarationInfo = new Map<string, DeclarationInfo>();
	private visitedDeclarations = new Set<string>();
	private collectedExternalImports = new Map<string, ExternalImportDetails>();
	private errors: string[] = [];
	private warnings: string[] = [];

	// Optimization: Cache for resolved dependencies
	private dependencyCache = new Map<string, Set<string>>();
	private processedNodes = new WeakSet<Node>();

	constructor(config: TrpcContractGeneratorConfig & { debug?: boolean }) {
		this.backendSrcPath = config.backendSrcDir;
		this.contractGeneratedRouterFile = config.outputContractFile;
		this.contractTrpcContextImportPath =
			config.trpcContextImportPath || "./trpc-context";
		this.zenstackRouterImportPath = config.zenstackRouterImportPath;
		this.importMappings = config.importMappings || {};
		this.debugMode =
			config.debug || process.env.TRPC_GENERATOR_DEBUG === "true";

		try {
			this.project = new Project({
				tsConfigFilePath: config.backendTsConfig,
			});
			this.project.addSourceFilesAtPaths(
				`${this.backendSrcPath}/**/*.ts`,
			);
		} catch (error) {
			throw new Error(
				`Failed to initialize TypeScript project: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private log(
		level: "info" | "warn" | "error" | "debug",
		message: string,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		...args: any[]
	): void {
		const timestamp = new Date().toISOString();
		const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

		if (level === "error") {
			this.errors.push(message);
			console.error(prefix, message, ...args);
		} else if (level === "warn") {
			this.warnings.push(message);
			console.warn(prefix, message, ...args);
		} else if (level === "debug" && this.debugMode) {
			console.log(prefix, message, ...args);
		} else if (level === "info") {
			console.log(prefix, message, ...args);
		}
	}

	private cleanExportKeyword(text: string): string {
		return text.replace(/^export\s+/gm, "");
	}

	private isExternalImport(importPath: string): boolean {
		return !importPath.startsWith(".") && !importPath.startsWith("/");
	}

	private isDatabasePackageImport(importPath: string): boolean {
		return importPath.startsWith("@mono/database");
	}

	private isZenstackPackageImport(importPath: string): boolean {
		return importPath.startsWith("@mono/database/zenstack");
	}

	private isZodImport(filePath: string): boolean {
		return (
			filePath.includes("node_modules/zod/") ||
			filePath.includes("/zod/lib/") ||
			filePath.endsWith("zod.d.ts") ||
			filePath.includes("/@types/zod") ||
			filePath.includes("node_modules/.pnpm/zod@") ||
			filePath.includes("/zod/") ||
			filePath.includes("\\zod\\")
		);
	}

	private isDatabaseGeneratedImport(filePath: string): boolean {
		return (
			filePath.includes("/packages/database/generated/") ||
			filePath.includes("\\packages\\database\\generated\\") ||
			filePath.includes("@mono/database/generated") ||
			filePath.endsWith("/generated/index.d.ts") ||
			filePath.endsWith("\\generated\\index.d.ts")
		);
	}

	private processSchemaNodeAndCollectDependencies(
		node: Node | undefined,
		sourceFileWhereNodeIsUsed: SourceFile,
	): string {
		if (!node) {
			return "z.undefined()";
		}

		const nodeText = node.getText();
		const zenstackExports = ["models", "objects", "enums", "types"];

		for (const exportName of zenstackExports) {
			if (nodeText.includes(`${exportName}.`)) {
				const moduleSpecifier = "@mono/database/zenstack";
				const mappedModuleSpecifier =
					this.importMappings[moduleSpecifier] || moduleSpecifier;

				const importDetails = this.collectedExternalImports.get(
					mappedModuleSpecifier,
				) || {
					namedImports: new Set(),
				};
				importDetails.namedImports.add(exportName);
				this.collectedExternalImports.set(
					mappedModuleSpecifier,
					importDetails,
				);
			}
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
			if (Node.isPropertyAccessExpression(node)) {
				const baseExpression = node.getExpression().getText();
				const zenstackExports = ["models", "objects", "enums", "types"];

				if (zenstackExports.includes(baseExpression)) {
					const moduleSpecifier = "@mono/database/zenstack";
					const mappedModuleSpecifier =
						this.importMappings[moduleSpecifier] || moduleSpecifier;

					if (
						!this.collectedExternalImports.has(
							mappedModuleSpecifier,
						)
					) {
						this.collectedExternalImports.set(
							mappedModuleSpecifier,
							{
								namedImports: new Set(),
							},
						);
					}
					const importDetails = this.collectedExternalImports.get(
						mappedModuleSpecifier,
					);
					if (importDetails) {
						importDetails.namedImports.add(baseExpression);
					}
				}
			}

			this.resolveAndCollectDependencies(node, sourceFileWhereNodeIsUsed);
			return node.getText();
		}

		// Handle CallExpression (z.B. models.ApiKeySchema.array(), objects.XyzSchema, etc.)
		if (Node.isCallExpression(node)) {
			const expression = node.getExpression();

			// Handle both direct PropertyAccess (models.Something) und chained calls (models.Something.array())
			let baseExpression: string | undefined;

			if (Node.isPropertyAccessExpression(expression)) {
				// Direkte property access: models.Something
				baseExpression = expression.getExpression().getText();
			} else if (
				Node.isCallExpression(expression) &&
				Node.isPropertyAccessExpression(expression.getExpression())
			) {
				// Verkettete calls: models.Something.array()
				const chainedProp =
					expression.getExpression() as PropertyAccessExpression;
				if (
					Node.isPropertyAccessExpression(chainedProp.getExpression())
				) {
					baseExpression = chainedProp.getExpression().getText();
				}
			}

			if (baseExpression) {
				// Liste der bekannten Zenstack-Exports
				const zenstackExports = ["models", "objects", "enums", "types"];

				if (zenstackExports.includes(baseExpression)) {
					const moduleSpecifier = "@mono/database/zenstack";
					const mappedModuleSpecifier =
						this.importMappings[moduleSpecifier] || moduleSpecifier;

					if (
						!this.collectedExternalImports.has(
							mappedModuleSpecifier,
						)
					) {
						this.collectedExternalImports.set(
							mappedModuleSpecifier,
							{
								namedImports: new Set(),
							},
						);
					}
					const importDetails = this.collectedExternalImports.get(
						mappedModuleSpecifier,
					);
					if (importDetails) {
						importDetails.namedImports.add(baseExpression);
					}
				}
			}

			this.resolveAndCollectDependencies(node, sourceFileWhereNodeIsUsed);
			return node.getText();
		}

		this.log(
			"warn",
			`Unerwarteter Knotentyp '${node.getKindName()}' in processSchemaNodeAndCollectDependencies`,
			`Text: ${node.getText().substring(0, 100)}`,
		);
		return node.getText();
	}

	private resolveAndCollectDependencies(
		node: Node,
		sourceFileContext: SourceFile,
	): void {
		// Optimization: Skip if already processed
		if (this.processedNodes.has(node)) {
			return;
		}
		this.processedNodes.add(node);

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
		const declSourceFilePath = declSourceFile.getFilePath();

		// Zod-Imports komplett ausschließen
		if (this.isZodImport(declSourceFilePath)) {
			this.log("debug", `Skipping Zod import from ${declSourceFilePath}`);
			return;
		}

		// Database-Generated-Imports komplett ausschließen
		if (this.isDatabaseGeneratedImport(declSourceFilePath)) {
			this.log(
				"debug",
				`Skipping Database-Generated import from ${declSourceFilePath}`,
			);
			return;
		}

		const originalDeclName = symbol.getName();
		const declarationKey = `${declSourceFilePath}#${originalDeclName}`;

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
				// Spezialbehandlung für Zenstack-Package-Imports
				if (this.isZenstackPackageImport(moduleSpecifier)) {
					// Zenstack-Package-Imports werden als externe Imports behandelt für die finale Ausgabe,
					// aber ihre Abhängigkeiten werden trotzdem gesammelt
					const mappedModuleSpecifier =
						this.importMappings[moduleSpecifier] || moduleSpecifier;

					if (
						!this.collectedExternalImports.has(
							mappedModuleSpecifier,
						)
					) {
						this.collectedExternalImports.set(
							mappedModuleSpecifier,
							{
								namedImports: new Set(),
							},
						);
					}
					const importDetails =
						// biome-ignore lint/style/noNonNullAssertion: <explanation>
						this.collectedExternalImports.get(
							mappedModuleSpecifier,
						)!;
					if (importNameForCollector) {
						if (isNamespace)
							importDetails.namespaceImport =
								importNameForCollector;
						else if (isDefault)
							importDetails.defaultImport =
								importNameForCollector;
						else
							importDetails.namedImports.add(
								importNameForCollector,
							);
					}

					// Versuche die lokale Zenstack-Datei zu finden und zu analysieren
					const zenstackFilePattern = moduleSpecifier.replace(
						"@mono/database/zenstack",
						"zenstack/zod",
					);
					const potentialZenstackFiles = this.project
						.getSourceFiles()
						.filter(
							(sf) =>
								sf
									.getFilePath()
									.includes(zenstackFilePattern) ||
								sf.getFilePath().includes("zenstack/zod"),
						);

					if (potentialZenstackFiles.length > 0) {
						// Verwende die erste gefundene Datei und behandle sie wie einen lokalen Import
						const zenstackFile = potentialZenstackFiles[0];
						let targetDeclName = originalDeclName;
						if (Node.isImportSpecifier(decl)) {
							targetDeclName = decl.getNameNode().getText();
						}

						const exportedSymbol = zenstackFile
							.getExportSymbols()
							.find((s) => s.getName() === targetDeclName);
						const targetDeclaration =
							exportedSymbol?.getDeclarations()[0];

						if (targetDeclaration) {
							this.resolveAndCollectDependencies(
								targetDeclaration,
								zenstackFile,
							);
						}
					}
					return;
				}

				// Spezialbehandlung für Database-Package-Imports
				if (this.isDatabasePackageImport(moduleSpecifier)) {
					// Database-Package-Imports werden als externe Imports behandelt,
					// aber ihre Abhängigkeiten werden nicht gesammelt
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
							importDetails.namespaceImport =
								importNameForCollector;
						else if (isDefault)
							importDetails.defaultImport =
								importNameForCollector;
						else
							importDetails.namedImports.add(
								importNameForCollector,
							);
					}
					return; // Wichtig: Hier stoppen, keine weiteren Abhängigkeiten sammeln
				}

				// Normale externe Imports (npm packages etc.)
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
					// NEU: Ausschluss für static methods und andere class members
					if (
						Node.isPropertyDeclaration(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isGetAccessorDeclaration(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
					if (
						Node.isSetAccessorDeclaration(parent) &&
						parent.getNameNode() === descendantNode
					)
						return;
				}

				const symbol = descendantNode.getSymbol();
				if (symbol) {
					const declarations = symbol.getDeclarations();
					if (declarations && declarations.length > 0) {
						const decl = declarations[0];

						// Ausschluss für static methods, getters, setters
						if (
							Node.isMethodDeclaration(decl) ||
							Node.isPropertyDeclaration(decl) ||
							Node.isGetAccessorDeclaration(decl) ||
							Node.isSetAccessorDeclaration(decl)
						) {
							const parentClass = decl.getFirstAncestorByKind(
								SyntaxKind.ClassDeclaration,
							);
							if (parentClass) {
								// Das ist ein Class Member - skip es
								console.warn(
									`WARN: Überspringe Class Member '${idText}' aus Klasse '${parentClass.getName()}' um Contract-Fehler zu vermeiden.`,
								);
								return;
							}
						}
					}

					// Bestehende Logik für andere Dependencies
					const idDeclarations = symbol.getDeclarations();
					if (idDeclarations && idDeclarations.length > 0) {
						const idActualDecl = idDeclarations[0];
						const idDeclSourceFile = idActualDecl.getSourceFile();
						const idDeclOriginalName = symbol.getName();
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
				this.log(
					"warn",
					`Zyklische Abhängigkeit erkannt bei '${declKey}'. Contract könnte unvollständig sein.`,
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
		// Clear all caches and collections
		this.collectedDeclarationInfo.clear();
		this.visitedDeclarations.clear();
		this.collectedExternalImports.clear();
		this.dependencyCache.clear();
		this.processedNodes = new WeakSet<Node>();
		this.errors = [];
		this.warnings = [];

		this.log("info", "Starting tRPC contract generation...");

		const sourceFiles = this.project.getSourceFiles();
		const procedures: ExtractedProcedureInfo[] = [];

		for (const sourceFile of sourceFiles) {
			try {
				const classes = sourceFile.getClasses();
				for (const classDeclaration of classes) {
					const routerDecorator =
						classDeclaration.getDecorator("TrpcRouter");
					if (!routerDecorator) continue;

					let domain: string | undefined;
					const routerDecoratorArg =
						routerDecorator.getArguments()[0];
					if (
						routerDecoratorArg &&
						Node.isObjectLiteralExpression(routerDecoratorArg)
					) {
						const domainProperty = routerDecoratorArg.getProperty(
							"domain",
						) as PropertyAssignment | undefined;
						if (domainProperty) {
							const initializer =
								domainProperty.getInitializerIfKind(
									SyntaxKind.StringLiteral,
								);
							if (initializer) {
								domain = initializer.getLiteralText();

								// Validate 'c' prefix convention for custom routers
								if (domain && !domain.startsWith("c")) {
									this.log(
										"warn",
										`Custom tRPC router '${classDeclaration.getName()}' has domain '${domain}' without 'c' prefix. ` +
											`This may conflict with Zenstack-generated routers. Consider using 'c${domain.charAt(0).toUpperCase() + domain.slice(1)}'.`,
										`File: ${sourceFile.getFilePath()}`,
									);
								}
							}
						}
					}

					for (const method of classDeclaration.getMethods()) {
						try {
							const procDecorator =
								method.getDecorator("TrpcProcedure");
							if (!procDecorator) continue;

							const procedureName = method.getName();
							const procDecoratorArg =
								procDecorator.getArguments()[0];
							if (
								!procDecoratorArg ||
								!Node.isObjectLiteralExpression(
									procDecoratorArg,
								)
							) {
								this.log(
									"warn",
									`Invalid @TrpcProcedure decorator on method '${procedureName}' - missing or invalid options object`,
								);
								continue;
							}

							const typeProperty = procDecoratorArg.getProperty(
								"type",
							) as PropertyAssignment | undefined;
							const isProtectedProperty =
								procDecoratorArg.getProperty("isProtected") as
									| PropertyAssignment
									| undefined;

							const trpcType = typeProperty
								?.getInitializerIfKind(SyntaxKind.StringLiteral)
								?.getLiteralText() as "query" | "mutation";

							let isProtected = false;
							if (isProtectedProperty) {
								const initializer =
									isProtectedProperty.getInitializer();
								if (
									initializer &&
									initializer.getKind() ===
										SyntaxKind.TrueKeyword
								) {
									isProtected = true;
								}
							}

							if (!trpcType) {
								this.log(
									"error",
									`Procedure '${procedureName}' in '${classDeclaration.getName()}' is missing 'type'. Skipping.`,
								);
								continue;
							}

							const inputSchemaNode =
								this.getZodSchemaInitializerNode(
									procDecorator,
									"inputType",
								);
							const outputSchemaNode =
								this.getZodSchemaInitializerNode(
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
						} catch (error) {
							this.log(
								"error",
								`Failed to process procedure '${method.getName()}' in class '${classDeclaration.getName()}'`,
								`Error: ${error instanceof Error ? error.message : String(error)}`,
							);
						}
					}
				}
			} catch (error) {
				this.log(
					"error",
					`Failed to process file '${sourceFile.getFilePath()}'`,
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		const orderedLocalDeclarations = this.topologicallySortDeclarations();

		// Check for errors before writing
		if (this.errors.length > 0) {
			this.log(
				"error",
				`Contract generation failed with ${this.errors.length} error(s)`,
			);
			for (const error of this.errors) {
				console.error(`  - ${error}`);
			}
			throw new Error("Contract generation failed due to errors");
		}

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
						actualDeclaration = firstDecl;
					}
				}
			}

			if (actualDeclaration) {
				if (Node.isVariableDeclaration(actualDeclaration)) {
					const initializer = actualDeclaration.getInitializer();
					if (initializer) {
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
			const nodeText = node.getText().substring(0, 60);
			return `undefined /* Placeholder für: ${nodeText.replace(/\*\//g, "*\\/")}*/`;
		}

		if (Node.isPropertyAccessExpression(node)) {
			const baseExpression = node.getExpression();
			const propertyName = node.getName();

			// Behandlung für direkte Zenstack-Schema-Referenzen (models.MonitorSchema, objects.CreateMonitorSchema etc.)
			const baseExpressionText = baseExpression.getText();
			const zenstackExports = ["models", "objects", "enums", "types"];
			const hasZenstackBase = zenstackExports.some(
				(exp) => baseExpressionText === exp,
			);

			if (hasZenstackBase && propertyName.endsWith("Schema")) {
				const fullSchemaExpression = `${baseExpressionText}.${propertyName}`;
				this.resolveAndCollectDependencies(node, sourceFileContext);

				// Dynamische Placeholder-Generierung für Zenstack-Schemas
				return this.generateDynamicSchemaPlaceholder(
					fullSchemaExpression,
					sourceFileContext,
				);
			}
		}

		if (Node.isCallExpression(node)) {
			const callee = node.getExpression();
			const args = node.getArguments();

			if (Node.isPropertyAccessExpression(callee)) {
				const baseOfCallee = callee.getExpression();
				const methodName = callee.getName();

				// Behandlung für Zenstack-Schema-Arrays (models.XyzSchema.array(), objects.XyzSchema.array() etc.)
				const baseExpressionText = baseOfCallee.getText();
				const zenstackExports = ["models", "objects", "enums", "types"];
				const hasZenstackBase = zenstackExports.some((exp) =>
					baseExpressionText.startsWith(`${exp}.`),
				);

				if (hasZenstackBase && methodName === "array") {
					const schemaName = baseExpressionText; // z.B. "models.ApiKeySchema" oder "objects.UserSchema"
					this.resolveAndCollectDependencies(node, sourceFileContext);

					// Dynamische Placeholder-Generierung für Zenstack-Schemas
					const placeholder = this.generateDynamicSchemaPlaceholder(
						baseExpressionText,
						sourceFileContext,
					);
					return `[${placeholder}]`;
				}

				// NEU: Behandlung für lokale Schema-Arrays (monitorSchema.array(), userSchema.array() etc.)
				if (Node.isIdentifier(baseOfCallee) && methodName === "array") {
					const baseSchemaName = baseOfCallee.getText();

					// Generiere Placeholder für das Basis-Schema
					const basePlaceholder = this.generatePlaceholderFromZodNode(
						baseOfCallee,
						sourceFileContext,
						depth + 1,
					);

					// Wenn das Basis-Schema ein vernünftiger Placeholder ist, nutze es für das Array
					if (
						basePlaceholder &&
						!basePlaceholder.includes("undefined") &&
						!basePlaceholder.includes("Placeholder für")
					) {
						return `[${basePlaceholder}]`;
					}

					// Fallback: Versuche, das Schema über Symbol-Resolution zu finden
					const symbol = baseOfCallee.getSymbol();
					if (symbol) {
						const decls = symbol.getDeclarations();
						if (decls && decls.length > 0) {
							const firstDecl = decls[0];
							if (Node.isVariableDeclaration(firstDecl)) {
								const initializer = firstDecl.getInitializer();
								if (initializer) {
									const schemaPlaceholder =
										this.generatePlaceholderFromZodNode(
											initializer,
											firstDecl.getSourceFile(),
											depth + 1,
										);
									if (
										schemaPlaceholder &&
										!schemaPlaceholder.includes("undefined")
									) {
										return `[${schemaPlaceholder}]`;
									}
								}
							}
						}
					}

					// Letzter Fallback für bekannte Schema-Namen
					if (
						baseSchemaName === "monitorSchema" ||
						baseSchemaName.toLowerCase().includes("monitor")
					) {
						return `[${this.generateSpecificPlaceholder("models", "Monitor")}]`;
					}
					if (
						baseSchemaName === "apiKeySchema" ||
						baseSchemaName.toLowerCase().includes("apikey")
					) {
						return `[${this.generateSpecificPlaceholder("models", "ApiKey")}]`;
					}
					if (baseSchemaName.toLowerCase().includes("user")) {
						return `[${this.generateSpecificPlaceholder("models", "User")}]`;
					}

					return `[] /* Array von ${baseSchemaName} */`;
				}

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
							return 'new Date("1970-01-01T00:00:00.000Z")';
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

		const nodeText =
			node?.getText().substring(0, 60) || "Unbekannter Knoten";
		return `undefined /* Placeholder für: ${nodeText.replace(/\*\//g, "*\\/")}*/`;
	}

	private writeContractFile(
		procedures: ExtractedProcedureInfo[],
		orderedLocalDeclarations: string[],
	): void {
		let code = "// AUTOGENERATED FILE - DO NOT EDIT MANUALLY\n\n";
		code += `import { createRouter as createGeneratedRouter } from '${this.zenstackRouterImportPath}';\n\n`;
		code += "import { z } from 'zod';\n";
		code += `import type { TRPCContext } from '${this.contractTrpcContextImportPath}';\n`;
		code += `import { createTRPCRouter, publicProcedure, protectedProcedure, mergeRouters } from './trpc';\n`;

		if (this.collectedExternalImports.size > 0) {
			code += "// External Imports\n";
			this.collectedExternalImports.forEach(
				(details, moduleSpecifier) => {
					const importParts: string[] = [];
					if (details.defaultImport) {
						importParts.push(details.defaultImport);
					}
					if (details.namespaceImport) {
						importParts.push(` ${details.namespaceImport}`);
					}
					if (details.namedImports && details.namedImports.size > 0) {
						// Sort and deduplicate named imports
						const uniqueImports = [
							...new Set(details.namedImports),
						].sort();
						importParts.push(`{ ${uniqueImports.join(", ")} }`);
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

		const proceduresByDomain: Record<string, ExtractedProcedureInfo[]> = {};
		// biome-ignore lint/complexity/noForEach: <explanation>
		procedures.forEach((p) => {
			const key = p.domain || "__ROOT__";
			if (!proceduresByDomain[key]) proceduresByDomain[key] = [];
			proceduresByDomain[key].push(p);
		});

		code += "export const customAppRouter = createTRPCRouter({\n";
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
				code += `  ${domain}: createTRPCRouter({\n`;
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
		code += "const generatedRouter = createGeneratedRouter();\n\n";
		code +=
			"export const appRouter = mergeRouters(generatedRouter, customAppRouter);\n\n";
		code += "export type AppRouter = typeof appRouter;\n";

		fs.ensureDirSync(path.dirname(this.contractGeneratedRouterFile));
		fs.writeFileSync(this.contractGeneratedRouterFile, code);
		console.log(
			`✅ tRPC contract generated at ${this.contractGeneratedRouterFile}`,
		);
	}

	/**
	 * Dynamische Placeholder-Generierung für Zenstack-Schemas und andere externe Schemas.
	 * Analysiert die tatsächliche Zod-Schema-Struktur zur Laufzeit.
	 */
	private generateDynamicSchemaPlaceholder(
		schemaExpression: string,
		sourceFileContext: SourceFile,
	): string {
		try {
			// Parse schema expression: models.MonitorSchema -> Monitor
			const [namespace, schemaName] = schemaExpression.split(".");
			const baseName = schemaName.replace("Schema", "");

			// Generate specific placeholders for known schemas
			return this.generateSpecificPlaceholder(namespace, baseName);
		} catch (error) {
			console.error(
				`Fehler bei der dynamischen Schema-Analyse für ${schemaExpression}:`,
				error,
			);
			return `{} /* Fehler bei Schema-Analyse für ${schemaExpression} */`;
		}
	}

	private generateSpecificPlaceholder(
		namespace: string,
		baseName: string,
	): string {
		// Spezifische Placeholder für bekannte Schemas
		switch (namespace) {
			case "models":
				switch (baseName) {
					case "Monitor":
						return `{
							id: "mon_1234567890",
							userId: "usr_1234567890",
							name: "Example Monitor",
							description: null,
							url: "https://example.com",
							heartbeatType: "HTTP",
							checkInterval: 300,
							timeout: 30,
							retryCount: 3,
							httpMethod: "GET",
							expectedStatus: 200,
							expectedContains: null,
							headers: {},
							body: null,
							isActive: true,
							alertOnFailure: true,
							alertOnRecovery: true,
							alertingProvider: "EMAIL",
							alertContacts: ["admin@example.com"],
							failureThreshold: 3,
							recoveryThreshold: 2,
							retryInterval: 60,
							maintenanceMode: false,
							maintenanceStart: null,
							maintenanceEnd: null,
							createdAt: new Date("2024-01-01T00:00:00.000Z"),
							updatedAt: new Date("2024-01-01T00:00:00.000Z")
						}`;
					case "ApiKey":
						return `{
							id: "ak_1234567890",
							userId: "usr_1234567890",
							name: "Example API Key",
							hash: "hashed_api_key_value",
							description: null,
							user: {},
							createdAt: new Date("2024-01-01T00:00:00.000Z"),
							updatedAt: new Date("2024-01-01T00:00:00.000Z")
						}`;
					case "User":
						return `{
							id: "usr_1234567890",
							email: "user@example.com",
							username: "example_user",
							role: "USER",
							isActive: true,
							createdAt: new Date("2024-01-01T00:00:00.000Z"),
							updatedAt: new Date("2024-01-01T00:00:00.000Z")
						}`;
					case "MonitorStats":
						return `{
							monitorId: "mon_1234567890",
							uptime: 99.5,
							averageResponseTime: 250,
							totalChecks: 1000,
							successfulChecks: 995,
							failedChecks: 5,
							lastCheckAt: new Date("2024-01-01T00:00:00.000Z"),
							isDown: false,
							downtimeDuration: 0,
							lastDownAt: null,
							lastUpAt: new Date("2024-01-01T00:00:00.000Z")
						}`;
					case "HeartbeatData":
						return `{
							timestamp: new Date("2024-01-01T00:00:00.000Z"),
							responseTime: 250,
							status: 200,
							success: true,
							error: null
						}`;
					default:
						return this.generateGenericModelPlaceholder();
				}

			case "objects":
				switch (baseName) {
					case "CreateMonitor":
						return `{
							name: "New Monitor",
							description: null,
							url: "https://example.com",
							heartbeatType: "HTTP",
							checkInterval: 300,
							timeout: 30,
							retryCount: 3,
							httpMethod: "GET",
							expectedStatus: 200,
							expectedContains: null,
							headers: {},
							body: null,
							isActive: true,
							alertOnFailure: true,
							alertOnRecovery: true,
							alertingProvider: "EMAIL",
							alertContacts: ["admin@example.com"],
							failureThreshold: 3,
							recoveryThreshold: 2,
							retryInterval: 60,
							maintenanceMode: false,
							maintenanceStart: null,
							maintenanceEnd: null
						}`;
					case "UpdateMonitor":
						return `{
							name: "Updated Monitor",
							description: "Updated description",
							url: "https://api.example.com",
							heartbeatType: "HTTP",
							checkInterval: 600,
							timeout: 45,
							retryCount: 5,
							httpMethod: "POST",
							expectedStatus: 201,
							expectedContains: "success",
							headers: {"Content-Type": "application/json"},
							body: "{\\"test\\": true}",
							isActive: false,
							alertOnFailure: false,
							alertOnRecovery: false,
							alertingProvider: "SLACK",
							alertContacts: ["webhook-url"],
							failureThreshold: 5,
							recoveryThreshold: 1,
							retryInterval: 120,
							maintenanceMode: true,
							maintenanceStart: new Date("2024-01-01T00:00:00.000Z"),
							maintenanceEnd: new Date("2024-01-02T00:00:00.000Z")
						}`;
					case "TestMonitor":
						return `{
							timestamp: new Date("2024-01-01T00:00:00.000Z"),
							responseTime: 150,
							success: true,
							status: 200,
							error: null
						}`;
					default:
						return this.generateGenericObjectPlaceholder();
				}

			case "enums":
				switch (baseName) {
					case "HttpMethod":
						return '"GET"';
					case "HeartbeatType":
						return '"HTTP"';
					case "AlertingProvider":
						return '"EMAIL"';
					case "UserRole":
						return '"USER"';
					default:
						return '"PLACEHOLDER_ENUM"';
				}

			case "types":
				return this.generateGenericTypePlaceholder();

			default:
				console.warn(
					`Unbekannter namespace: ${namespace}, verwende generischen Placeholder`,
				);
				return this.generateGenericModelPlaceholder();
		}
	}

	private generateGenericModelPlaceholder(): string {
		return `{
			id: "placeholder_id",
			createdAt: new Date("2024-01-01T00:00:00.000Z"),
			updatedAt: new Date("2024-01-01T00:00:00.000Z")
		}`;
	}

	private generateGenericObjectPlaceholder(): string {
		return `{
			name: "Placeholder Object",
			isActive: true
		}`;
	}

	private generateGenericTypePlaceholder(): string {
		return '"PLACEHOLDER_TYPE"';
	}

	/**
	 * Analysiert eine Zod-Schema-Deklaration aus einer .d.ts-Datei und erstellt einen passenden Placeholder.
	 */
	private analyzeZodSchemaFromDeclaration(
		schemaFile: SourceFile,
		schemaName: string,
	): string | null {
		try {
			const exportedDeclarations = schemaFile.getExportedDeclarations();
			const schemaDeclaration = exportedDeclarations.get(schemaName);

			if (!schemaDeclaration || schemaDeclaration.length === 0) {
				return null;
			}

			const declaration = schemaDeclaration[0];
			if (Node.isVariableDeclaration(declaration)) {
				const typeNode = declaration.getTypeNode();
				if (typeNode) {
					return this.parseZodTypeDeclaration(typeNode);
				}
			}

			return null;
		} catch (error) {
			console.error(
				`Fehler beim Analysieren der Schema-Deklaration für ${schemaName}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Parst eine Zod-Typ-Deklaration und erstellt ein passendes Placeholder-Objekt.
	 */
	private parseZodTypeDeclaration(typeNode: Node): string {
		const typeText = typeNode.getText();

		// Suche nach ZodObject-Pattern: z.ZodObject<{...}, ...>
		const zodObjectMatch = typeText.match(/z\.ZodObject<\{([^}]*)\}/);
		if (zodObjectMatch) {
			const fieldsText = zodObjectMatch[1];
			const fields = this.parseZodObjectFields(fieldsText);

			const placeholderObj: Record<string, string> = {};

			for (const [fieldName, fieldType] of Object.entries(fields)) {
				placeholderObj[fieldName] =
					this.generatePlaceholderForZodType(fieldType);
			}

			return JSON.stringify(placeholderObj, null, 2);
		}

		return "{}";
	}

	/**
	 * Parst die Felder eines ZodObject aus dem Typ-Text.
	 */
	private parseZodObjectFields(fieldsText: string): Record<string, string> {
		const fields: Record<string, string> = {};

		// Einfaches Parsing der Felder (vereinfacht für die häufigsten Fälle)
		const fieldMatches = fieldsText.match(/(\w+):\s*([^;]+);/g);
		if (fieldMatches) {
			for (const match of fieldMatches) {
				const [, fieldName, fieldType] =
					match.match(/(\w+):\s*([^;]+);/) || [];
				if (fieldName && fieldType) {
					fields[fieldName.trim()] = fieldType.trim();
				}
			}
		}

		return fields;
	}

	/**
	 * Generiert einen passenden Placeholder-Wert für einen Zod-Typ.
	 */
	private generatePlaceholderForZodType(zodType: string): string {
		if (zodType.includes("z.ZodString")) {
			return '"PLACEHOLDER_STRING"';
		}
		if (zodType.includes("z.ZodDate")) {
			return 'new Date("1970-01-01T00:00:00.000Z")';
		}
		if (zodType.includes("z.ZodNumber")) {
			return "0";
		}
		if (zodType.includes("z.ZodBoolean")) {
			return "false";
		}
		if (
			zodType.includes("z.ZodOptional") ||
			zodType.includes("z.ZodNullable")
		) {
			return "null";
		}
		if (zodType.includes("z.ZodDefault")) {
			// Für Default-Werte, extrahiere den inneren Typ
			const innerTypeMatch = zodType.match(/z\.ZodDefault<([^>]+)>/);
			if (innerTypeMatch) {
				return this.generatePlaceholderForZodType(innerTypeMatch[1]);
			}
			return "null";
		}
		if (zodType.includes("z.ZodRecord")) {
			return "{}";
		}
		if (zodType.includes("z.ZodArray")) {
			return "[]";
		}

		// Fallback für unbekannte Typen
		return '"PLACEHOLDER_UNKNOWN"';
	}

	/**
	 * Generiert ein Fallback-Placeholder basierend auf dem Schema-Namen.
	 */
	private generateFallbackPlaceholder(schemaName: string): string {
		if (schemaName.includes("Monitor")) {
			return this.generateSpecificPlaceholder("models", "Monitor");
		}
		if (schemaName.includes("ApiKey")) {
			return this.generateSpecificPlaceholder("models", "ApiKey");
		}
		if (schemaName.includes("User")) {
			return this.generateSpecificPlaceholder("models", "User");
		}

		// Generisches Fallback-Objekt
		return this.generateGenericModelPlaceholder();
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
