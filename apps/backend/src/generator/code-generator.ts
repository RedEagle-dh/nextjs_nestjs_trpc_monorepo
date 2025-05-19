// ignore this whole file from biome
import * as path from "node:path";
import * as fs from "fs-extra";
import {
	Decorator,
	Node,
	ObjectLiteralExpression,
	Project,
	PropertyAssignment,
	SourceFile,
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
	private typesAndEnumsToDefineInContract = new Map<string, string>(); // Identifier -> Code-String der Definition
	private importsToAddToContract = new Map<string, Set<string>>(); // ModuleSpecifier -> Set von namedImports

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

	private resolveIdentifierAndGetCode(
		node: Node | undefined,
		sourceFile: SourceFile,
	): { code: string; isInlineable: boolean } | undefined {
		if (!node) {
			// Wenn kein Node übergeben wird, direkt undefined zurückgeben
			return undefined;
		}

		if (
			(Node.isCallExpression(node) &&
				node.getExpression().getText().startsWith("z.")) ||
			(Node.isPropertyAccessExpression(node) &&
				node.getExpression().getText().startsWith("z.")) // Für z.B. z.Schema.optional()
		) {
			// Bevor wir den Code nehmen, sammeln wir Abhängigkeiten *innerhalb* dieses Zod-Schemas
			this.collectDependenciesFromSchemaNode(node, sourceFile); // Bestehende Methode
			return { code: node.getText(), isInlineable: true };
		}

		if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node)) {
			const symbol = node.getSymbol();
			if (!symbol) return { code: node.getText(), isInlineable: false }; // Fallback: Identifier-Name

			const declarations = symbol.getDeclarations();
			if (!declarations || declarations.length === 0)
				return { code: node.getText(), isInlineable: false };

			const decl = declarations[0]; // Nimm die erste Deklaration

			// Ist es ein Import?
			if (Node.isImportSpecifier(decl) || Node.isNamespaceImport(decl)) {
				// const importDeclaration = decl.getImportClause()?.getParent() || // Alte Zeile
				//                           decl.getParentIfKind(SyntaxKind.ImportDeclaration); // Alte Zeile
				const importDeclaration = decl.getFirstAncestorByKind(
					SyntaxKind.ImportDeclaration,
				);

				if (importDeclaration) {
					// Node.isImportDeclaration(importDeclaration) ist implizit
					const moduleSpecifier =
						importDeclaration.getModuleSpecifierValue();
					let name: string;

					if (Node.isImportSpecifier(decl)) {
						// Für import { OriginalName as AliasName } from '...' -> AliasName
						// Für import { Name } from '...' -> Name
						name = decl.getAliasNode()?.getText() || decl.getName();
					} else {
						// Muss NamespaceImport sein, z.B. import * as MyNamespace from '...'
						name = decl.getNameNode().getText(); // Ergibt "MyNamespace"
					}

					// ... Rest der Logik für Importe bleibt gleich ...
					if (
						moduleSpecifier.startsWith("packages/") ||
						moduleSpecifier.startsWith("@") ||
						!moduleSpecifier.startsWith(".")
					) {
						if (!this.importsToAddToContract.has(moduleSpecifier)) {
							this.importsToAddToContract.set(
								moduleSpecifier,
								new Set(),
							);
						}
						this.importsToAddToContract
							.get(moduleSpecifier)
							?.add(name);
						return { code: name, isInlineable: false }; // Verwende den importierten Identifier-Namen
					}
					console.warn(
						`WARN: Relativer Backend-Import für '${name}' aus '${moduleSpecifier}'. Versuche Definition zu kopieren. Dies ist experimentell und funktioniert am besten für Enums und einfache Typ-Aliase oder Konstanten.`,
					);
					// Wenn es ein relativer Import innerhalb des Backends ist, wird die Definition kopiert (nächste if-Blöcke)
				}
			}

			// Ist es eine Enum-, Typ- oder Variablendeklaration im Backend? -> Definition kopieren
			if (
				Node.isEnumDeclaration(decl) ||
				Node.isTypeAliasDeclaration(decl) ||
				Node.isInterfaceDeclaration(decl)
			) {
				// InterfaceDeclaration hinzugefügt
				const name = decl.getNameNode().getText();
				const code = decl.getText(); // Hole den gesamten Text der Deklaration
				if (!this.typesAndEnumsToDefineInContract.has(name)) {
					this.typesAndEnumsToDefineInContract.set(name, code);
					console.log(
						`INFO: Queued to copy definition for '${name}' from ${decl.getSourceFile().getFilePath()}`,
					);
				}
				return { code: name, isInlineable: false }; // Verwende den Namen der kopierten Definition
			}

			if (Node.isVariableDeclaration(decl)) {
				const initializer = decl.getInitializer();
				if (initializer) {
					const name = decl.getNameNode().getText();
					// Hole das gesamte Statement (z.B. "export const name = ...;")
					const variableStatement = decl.getVariableStatement();
					const code = variableStatement
						? variableStatement.getText() // Beinhaltet 'export', 'const' etc.
						: `const ${name} = ${initializer.getText()};`; // Fallback, sollte nicht oft nötig sein

					if (!this.typesAndEnumsToDefineInContract.has(name)) {
						this.typesAndEnumsToDefineInContract.set(name, code);
						console.log(
							`INFO: Definition für Variable '${name}' aus ${decl.getSourceFile().getFilePath()} zum Kopieren vorgemerkt.`,
						);
					}
					return { code: name, isInlineable: false };
				}
			}

			if (Node.isPropertyDeclaration(decl)) {
				const initializer = decl.getInitializer();
				if (initializer) {
					const name = decl.getNameNode().getText();
					// decl.getText() liefert die gesamte Property-Deklaration (z.B. "static readonly meinSchema = ...;")
					const code = decl.getText();
					if (!this.typesAndEnumsToDefineInContract.has(name)) {
						this.typesAndEnumsToDefineInContract.set(name, code);
						console.log(
							`INFO: Definition für Property '${name}' aus ${decl.getSourceFile().getFilePath()} zum Kopieren vorgemerkt.`,
						);
					}
					return { code: name, isInlineable: false };
				}
			}

			return { code: node.getText(), isInlineable: false }; // Fallback
		}
		return { code: node.getText(), isInlineable: true }; // Direkter Zod-Aufruf etc.
	}

	private collectTypeDefsFromNode(
		node: Node | undefined,
		originatingSourceFile: SourceFile,
	): void {
		if (!node) return;

		node.forEachDescendant((descendantNode) => {
			if (Node.isIdentifier(descendantNode)) {
				const name = descendantNode.getText();
				// Einfache Filterung für globale/primitive Typen
				if (
					[
						"z",
						"ZodType",
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
					].includes(name) ||
					(typeof globalThis !== "undefined" && name in globalThis)
				) {
					return;
				}

				// Wenn dieser Identifier bereits bekannt ist (wird kopiert oder importiert), überspringen
				if (
					this.typesAndEnumsToDefineInContract.has(name) ||
					Array.from(this.importsToAddToContract.values()).some(
						(set) => set.has(name),
					)
				) {
					return;
				}

				const symbol = descendantNode.getSymbol();
				if (symbol) {
					const declarations = symbol.getDeclarations();
					if (declarations && declarations.length > 0) {
						const decl = declarations[0]; // Nimm die erste Deklaration
						// Rufe die Logik auf, um diese Deklaration zu kopieren oder zu importieren
						// Wichtig: decl.getSourceFile() ist hier die Datei, wo der Typ *definiert* ist.
						this.resolveIdentifierAndGetCode(
							decl,
							decl.getSourceFile(),
						);
					} else {
						console.warn(
							`WARN: Keine Deklaration für Typ-Identifier '${name}' gefunden, der in ${originatingSourceFile.getFilePath()} verwendet wird.`,
						);
					}
				}
			}
			// Rekursiv für Typargumente, z.B. MyGeneric<TypeA, TypeB>
			if (Node.isTypeReference(descendantNode)) {
				// biome-ignore lint/complexity/noForEach: <explanation>
				descendantNode
					.getTypeArguments()
					.forEach((arg) =>
						this.collectTypeDefsFromNode(
							arg,
							originatingSourceFile,
						),
					);
			}
			// Man könnte hier auch andere Node-Typen hinzufügen, die Typ-Identifier enthalten können
		});
	}

	private collectDependenciesFromSchemaNode(
		schemaNode: Node,
		sourceFileOfSchemaUsage: SourceFile,
	): void {
		if (!schemaNode) return;

		schemaNode.forEachDescendant((descendantNode, traversal) => {
			if (Node.isIdentifier(descendantNode)) {
				const identifierName = descendantNode.getText();

				// Ignoriere 'z' und globale Typen/Variablen
				if (
					identifierName === "z" ||
					[
						"Promise",
						"Date",
						"Array",
						"Object",
						"String",
						"Number",
						"Boolean",
						"Symbol",
					].includes(identifierName) ||
					(typeof globalThis !== "undefined" &&
						identifierName in globalThis)
				) {
					return;
				}

				// Wenn es ein Funktionsparameter ist (z.B. in transform), ignoriere ihn hier
				if (descendantNode.getParentIfKind(SyntaxKind.Parameter)) {
					return;
				}

				const parentNode = descendantNode.getParent();
				if (parentNode && Node.isPropertyAssignment(parentNode)) {
					// Prüfe, ob der Parent eine PropertyAssignment ist
					if (parentNode.getNameNode() === descendantNode) {
						// Prüfe, ob der Identifier der Name dieser Property ist
						return; // Ja, es ist der Schlüssel, also ignorieren
					}
				}

				// Versuche, die Definition dieses Identifiers aufzulösen
				// Die Logik von resolveIdentifierAndGetCode ist gut dafür, aber wir wollen hier nur
				// die Nebeneffekte (Füllen von this.importsToAddToContract und this.typesAndEnumsToDefineInContract).
				// Der zurückgegebene 'code' ist hier nicht direkt relevant, da der Haupt-Schema-Code schon extrahiert wurde.
				// Wichtig ist, dass resolveIdentifierAndGetCode die Definitionen sammelt.
				// console.log(`Found internal identifier: ${identifierName} in schema. Attempting to resolve...`);
				this.resolveIdentifierAndGetCode(
					descendantNode,
					descendantNode.getSourceFile() || sourceFileOfSchemaUsage,
				);
			}
			// Optional: PropertyAccessExpressions (z.B. MyEnums.Status) behandeln, wenn 'MyEnums' aufgelöst werden muss
			else if (Node.isPropertyAccessExpression(descendantNode)) {
				const expression = descendantNode.getExpression();
				if (expression.getText() !== "z") {
					// Ignoriere z.string, z.object etc. hier
					// console.log(`Found internal property access: ${descendantNode.getText()}. Attempting to resolve base: ${expression.getText()}`);
					this.resolveIdentifierAndGetCode(
						expression,
						expression.getSourceFile() || sourceFileOfSchemaUsage,
					);
				}
			}
		});
	}

	public async generateContract(): Promise<void> {
		const sourceFiles = this.project.getSourceFiles();

		this.typesAndEnumsToDefineInContract.clear();
		this.importsToAddToContract.clear();
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

					if (inputSchemaNode) {
						this.collectDependenciesFromSchemaNode(
							inputSchemaNode,
							sourceFile,
						);
					}
					if (outputSchemaNode) {
						this.collectDependenciesFromSchemaNode(
							outputSchemaNode,
							sourceFile,
						);
					}

					const inputResolution = this.resolveIdentifierAndGetCode(
						inputSchemaNode,
						sourceFile,
					);
					const outputResolution = this.resolveIdentifierAndGetCode(
						outputSchemaNode,
						sourceFile,
					);

					const inputTypeCode = inputResolution
						? inputResolution.code
						: "z.undefined()";
					const outputTypeCode = outputResolution
						? outputResolution.code
						: undefined;

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
		// @ts-ignore
	): string {
		if (!node || depth > 3) {
			// Maximale Tiefe etwas reduziert, um bei komplexen Rekursionen sicher zu sein
			return `undefined /* ${!node ? "Kein Schema-Knoten für Placeholder" : "Maximale Rekursionstiefe erreicht"} */`;
		}

		if (Node.isCallExpression(node)) {
			// z.B. z.string(), z.object({...})
			const callee = node.getExpression(); // z.B. z.string, z.object, oder z.string().optional
			const args = node.getArguments();

			if (Node.isPropertyAccessExpression(callee)) {
				const baseOfCalleeOrChainedMethod = callee.getExpression(); // z.B. 'z' oder 'z.string()'
				const methodNameOrChainedName = callee.getName();

				if (baseOfCalleeOrChainedMethod.getText() === "z") {
					const directZodMethodName = methodNameOrChainedName;

					switch (directZodMethodName) {
						case "string":
							return '"PLACEHOLDER_STRING"';
						case "number":
							return "0";
						case "bigint":
							return "0n"; // Korrekter BigInt-Literal Placeholder
						case "boolean":
							return "false";
						case "date":
							return `new Date("1970-01-01T00:00:00.000Z").toISOString()`; // Spezifischer ISO-String
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
						case "enum": // z.enum(['A', 'B'])
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
							const enumIdentifierNode = args[0]; // Der AST-Knoten für z.B. "TestNativeNumericEnum"
							if (
								enumIdentifierNode &&
								Node.isIdentifier(enumIdentifierNode)
							) {
								const enumName = enumIdentifierNode.getText(); // z.B. "TestNativeNumericEnum"

								// Die Enum-Definition wurde bereits an den Anfang der Datei kopiert
								// und sollte im Scope der Placeholder-Funktion verfügbar sein.
								// Wir versuchen, den Namen des ersten deklarierten Members zu finden.
								const enumDefinitionString =
									this.typesAndEnumsToDefineInContract.get(
										enumName,
									);
								if (enumDefinitionString) {
									// Einfache Regex, um den ersten Member-Namen zu finden.
									// Beispiele:
									// enum MyEnum { MEMBER_A = 1, ... } -> MEMBER_A
									// enum MyEnum { MEMBER_A, ... } -> MEMBER_A
									const firstMemberMatch =
										enumDefinitionString.match(
											// Sucht nach { optionalWhitespace MEMBER_NAME optionalWhitespace [optional = Wert] [optional Komma/}]
											/{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=[\s\S]*?)?[\s,}]/m,
										);
									if (firstMemberMatch?.[1]) {
										const firstMemberName =
											firstMemberMatch[1];
										// Generiere validen Code, der auf das Enum-Mitglied zugreift, z.B. "TestNativeNumericEnum.ADMIN"
										return `${enumName}.${firstMemberName}`;
									}
								}
								// Fallback, wenn der Member-Name nicht extrahiert werden konnte.
								// Dieser Fallback ist immer noch nicht perfekt für den *Wert*, aber das
								// .output(z.nativeEnum(enumName)) im Contract stellt die Typsicherheit her.
								// Der Fehler "Typ "0" kann dem Typ "TestNativeNumericEnum" nicht zugewiesen werden"
								// bedeutet, der Placeholder-WERT muss ein gültiges Enum-Mitglied sein.
								// Wenn TestNativeNumericEnum.ADMIN den Wert 1 hat, ist 1 ein gültiger Placeholder.
								// Ohne die Enum-Struktur hier zur Laufzeit des Generators genau zu kennen,
								// ist es schwierig, den *korrekten* ersten Wert (0, 1, oder einen String) zu garantieren.
								// Die ${enumName}.${firstMemberName} Variante ist am robustesten.
								// Wenn das fehlschlägt, ist ein informativer Kommentar + ein Cast oft das Beste für einen Placeholder.
								console.warn(
									`Konnte ersten Member für nativeEnum '${enumName}' nicht automatisch bestimmen. Der generierte Code für das .output() ist korrekt, aber der Placeholder-Rückgabewert könnte manuell angepasst werden müssen, um typsicher zu sein oder einen sinnvollen Default darzustellen. Verwende '${enumName}[Object.keys(${enumName})[0]]' als generischen Fallback.`,
								);
								// Dieser Fallback versucht, den Wert des ersten Keys zu nehmen.
								// Für numerische Enums gibt Object.keys() auch die numerischen Werte als Strings zurück,
								// z.B. für enum E { A = 1 } -> Object.keys(E) ist ["1", "A"]. Der erste Key wäre "1". E["1"] ist "A".
								// Für String-Enums enum E { A = "valA" } -> Object.keys(E) ist ["A"]. E["A"] ist "valA".
								// Das ist also ein relativ guter, wenn auch komplex aussehender, Fallback für den Wert.
								return `(${enumName} as any)[Object.keys(${enumName})[0]]`;
							}
							return "undefined /* Defektes z.nativeEnum für Placeholder oder Enum-Identifier nicht gefunden */";
						}
						case "object":
							if (
								args[0] &&
								Node.isObjectLiteralExpression(args[0])
							) {
								const shape =
									args[0] as ObjectLiteralExpression;
								let objStr = "{";
								const properties = shape.getProperties();
								for (let i = 0; i < properties.length; i++) {
									const prop = properties[i];
									if (Node.isPropertyAssignment(prop)) {
										const keyNode = prop.getNameNode();
										// Schlüssel kann Identifier oder StringLiteral sein
										const key = Node.isIdentifier(keyNode)
											? keyNode.getText()
											: // @ts-ignore
												keyNode.getLiteralText();
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
							// Für mehr Typsicherheit (falls das Element nicht optional ist), könnte man ein Element generieren:
							// const elementSchemaNode = args[0];
							// return `[${this.generatePlaceholderFromZodNode(elementSchemaNode, depth + 1)}]`;
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
						case "discriminatedUnion":
							// Nimm die erste Option des Unions/DiscriminatedUnions für den Placeholder
							if (
								args[0] &&
								(Node.isArrayLiteralExpression(args[0]) ||
									(directZodMethodName ===
										"discriminatedUnion" &&
										args[1] &&
										Node.isArrayLiteralExpression(args[1])))
							) {
								const optionsArray = (
									directZodMethodName === "discriminatedUnion"
										? args[1]
										: args[0]
								) as Node;
								if (
									Node.isArrayLiteralExpression(optionsArray)
								) {
									const firstOptionSchema =
										optionsArray.getElements()[0];
									if (firstOptionSchema) {
										return this.generatePlaceholderFromZodNode(
											firstOptionSchema,
											depth + 1,
										);
									}
								}
							}
							return "undefined as any /* Komplexes z.union/z.discriminatedUnion */";
						case "record":
							// z.record(keySchema, valueSchema)
							// Sicherster Placeholder ist ein leeres Objekt
							return "{}";
						case "lazy":
							// Für z.lazy(() => schema), versuche, den Body der Funktion zu bekommen
							if (args[0] && Node.isArrowFunction(args[0])) {
								const body = args[0].getBody();
								// Wenn Tiefe noch ok ist, rekursiv aufrufen, sonst undefined
								return depth < 3
									? this.generatePlaceholderFromZodNode(
											body,
											depth + 1,
										)
									: "undefined /* Rekursionstiefe für z.lazy erreicht */";
							}
							return "undefined as any /* Komplexes z.lazy */";

						// Effekte: Wir müssen den Typ *vor* dem Effekt für den Input des Effekts
						// und den Typ *nach* dem Effekt für den Output des Placeholders betrachten.
						// Da wir hier den Output-Placeholder generieren, ist der Typ *nach* dem Effekt relevant.
						// Dies wird aber meist durch chained calls behandelt (siehe unten).
					}
				}
				const chainedMethod = methodNameOrChainedName;
				switch (chainedMethod) {
					case "optional":
						return "undefined";
					case "nullable":
						return "null";
					case "default":
						// Für .default(value), könnten wir versuchen, 'value' zu extrahieren.
						// Oder, einfacher für Placeholder, den Basistyp nehmen.
						return this.generatePlaceholderFromZodNode(
							baseOfCalleeOrChainedMethod,
							depth + 1,
						);
					case "transform":
					case "pipe": // pipe kann den Output-Typ ändern
						// Für .transform(fn) oder .pipe(anotherSchema), ist der Output-Typ durch fn bzw. anotherSchema bestimmt.
						// Dies ist schwer allein aus dem AST des *Inputs* zu `transform` zu bestimmen für den *Output-Placeholder*.
						// ABER: Das `outputType` im Decorator ist ja bereits das *gesamte* Schema inkl. .transform().
						// Wenn wir also `node` hier als das gesamte `z.something().transform(...)` haben,
						// und `z.something()` nicht weiter aufgelöst wird, greift der Fallback.
						// Eine bessere Lösung wäre, den Output-Typ des ZodEffects-Typs zu inspizieren, was ohne eval() schwer ist.
						// Sicherster Fallback für den Placeholder-Wert:
						console.warn(
							`Placeholder für Zod-Effekt '${chainedMethod}' wird zu 'undefined as any'. Das .output() im Vertrag ist aber korrekt.`,
						);
						return "undefined as any";
					case "refine":
					case "superRefine":
						// .refine() ändert den Typ nicht, also den Placeholder des Basistyps verwenden.
						return this.generatePlaceholderFromZodNode(
							baseOfCalleeOrChainedMethod,
							depth + 1,
						);
				}
			}
			// Fallback für nicht direkt behandelte oder komplexe Zod-Strukturen
			const schemaText =
				node?.getText().substring(0, 60) || "Unbekannter Knoten";
			console.warn(
				`Generiere generischen Placeholder für Zod AST Knoten: ${node?.getKindName()}, Text: ${schemaText}...`,
			);
			return "undefined as any /* Komplexes/Unbekanntes Zod-Schema für Placeholder-Wert */";
		}
	}

	private writeContractFile(procedures: ExtractedProcedureInfo[]): void {
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		let code = `// AUTOGENERATED FILE - DO NOT EDIT MANUALLY\n\n`;
		code += `import { initTRPC, TRPCError } from '@trpc/server';\n`;
		code += `import { z } from 'zod';\n`; // Zod wird für die inline Schemas benötigt
		code += `import type { TRPCContext } from '${this.contractTrpcContextImportPath}';\n\n`;

		this.typesAndEnumsToDefineInContract.forEach((c, name) => {
			code += `${c}\n\n`;
		});
		this.importsToAddToContract.forEach((names, moduleSpecifier) => {
			code += `import { ${[...names].join(", ")} } from '${moduleSpecifier}';\n`;
		});

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
