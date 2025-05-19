// apps/backend/src/user/user.trpc.ts
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { TrpcProcedure, TrpcRouter } from "src/trpc/decorators";
import { z } from "zod";

enum TestNativeNumericEnum {
	ADMIN = 1,
	USER = 2,
	GUEST = 3,
}

enum TestNativeStringEnum {
	ACTIVE = "active",
	INACTIVE = "inactive",
	PENDING = "pending",
}
@Injectable()
@TrpcRouter({ domain: "user" }) // Kennzeichnet dies als Router für die 'user'-Domäne
export class UserTrpcRouter {
	@TrpcProcedure({
		inputType: z.string(),
		outputType: z.object({
			status: z.string(),
			timestamp: z.string(),
		}),
		type: "query",
		isProtected: false,
	})
	async getHealthcheck() {
		console.log(
			"tRPC contract placeholder for 'user.getHealthcheck' called.",
		);
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
	}

	@TrpcProcedure({
		type: "mutation", // Machen wir es zu einer Mutation für Abwechslung
		isProtected: false, // Öffentlich für einfachen Test
		inputType: z.object({
			// Grundlegende Typen
			myString: z.string().min(3, "Mindestens 3 Zeichen").max(50),
			myNumber: z.number().int().positive(),
			myBigInt: z.bigint().optional(),
			myBoolean: z.boolean(),
			myDate: z.date(),
			myNull: z.null(),
			myUndefined: z.undefined(), // oder z.void() für Inputs, die explizit undefined sein sollen

			// Literale
			myLiteralString: z.literal("HalloWelt"),
			myLiteralNumber: z.literal(42),
			myLiteralBoolean: z.literal(true),

			// Enums
			myStringEnum: z.enum(["Apfel", "Birne", "Orange"]),
			myNativeNumericEnum: z.nativeEnum(TestNativeNumericEnum),
			myNativeStringEnum: z.nativeEnum(TestNativeStringEnum).optional(),

			// Strukturen
			myObject: z.object({
				nestedId: z.string().uuid(),
				nestedValue: z.string().optional(),
				deeplyNested: z.object({
					deepValue: z.number().nullable(),
				}),
			}),
			myStringArray: z
				.array(z.string())
				.nonempty("Array darf nicht leer sein"),
			myNumberArray: z.array(z.number()),
			myObjectArray: z
				.array(
					z.object({
						id: z.number(),
						prop: z.string().nullable(),
					}),
				)
				.optional(),
			myTuple: z.tuple([z.string(), z.number(), z.boolean().optional()]),

			// Modifikatoren
			myOptionalString: z.string().optional(),
			myNullableNumber: z.number().nullable(),
			myStringWithDefault: z.string().default("Standardwert"),

			// Fortgeschrittenere Typen
			myUnion: z.union([z.string().email(), z.number().max(10)]),
			myDiscriminatedUnion: z.discriminatedUnion("kind", [
				z.object({ kind: z.literal("a"), valueA: z.string() }),
				z.object({ kind: z.literal("b"), valueB: z.number() }),
			]),
			myRecord: z.record(z.string().startsWith("key_"), z.boolean()), // String-Keys, die mit "key_" beginnen, boolean values

			// Effekte (Generator sollte den Basistyp für Placeholder verwenden)
			myTransformedString: z.string().transform((val) => val.length), // Input ist string, Output ist number
			myRefinedNumber: z.number().refine((n) => n > 10, "Muss > 10 sein"),

			// Beliebige Typen (mit Vorsicht für Generierung)
			// myAny: z.any().optional(), // Generator wird hier wahrscheinlich 'any' als Placeholder nehmen
			// myUnknown: z.unknown().optional(), // Ähnlich wie any
		}),
		outputType: z.object({
			// Output-Schema spiegelt die Input-Struktur für Testzwecke
			receivedString: z.string(),
			processedNumber: z.number(),
			echoedBigInt: z.bigint().optional(),
			toggledBoolean: z.boolean(),
			formattedDate: z.string(), // Datum wird als String zurückgegeben
			confirmedNull: z.null(),
			wasUndefined: z.boolean(), // Indikator, ob myUndefined gesendet wurde

			literalEchoString: z.literal("HalloWelt"),
			literalEchoNumber: z.literal(42),
			literalEchoBoolean: z.literal(true),

			selectedStringEnum: z.enum(["Apfel", "Birne", "Orange"]),
			selectedNativeNumericEnum: z.nativeEnum(TestNativeNumericEnum),
			selectedNativeStringEnum: z
				.nativeEnum(TestNativeStringEnum)
				.optional(),

			structuredObject: z.object({
				originalId: z.string(),
				computedValue: z.string(),
				deepStatus: z.string().nullable(),
			}),
			stringArrayLength: z.number(),
			sumOfNumbers: z.number(),
			objectArrayCount: z.number().optional(),
			tupleValues: z.object({
				val1: z.string(),
				val2: z.number(),
				val3: z.boolean().optional(),
			}),

			optionalStringPresent: z.boolean(),
			isNumberNull: z.boolean(),
			defaultedString: z.string(),

			unionType: z.union([z.string(), z.number()]), // Spiegeln, was empfangen wurde
			discriminatedUnionEcho: z.discriminatedUnion("kind", [
				// Spiegeln
				z.object({ kind: z.literal("a"), valueA: z.string() }),
				z.object({ kind: z.literal("b"), valueB: z.number() }),
			]),
			recordKeys: z.array(z.string()),

			lazyNodeId: z.string().uuid().optional(),

			transformedStringLength: z.number(), // Output des Transformators
			refinedNumberPassthrough: z.number(), // Nummer wird durchgereicht
		}),
	})
	async processAllTypes(
		// Für die Typsicherheit der Implementierung verwenden wir z.infer
		// Der erste Parameter 'input' ist optional, wenn inputType z.undefined() ist.
		// Da wir ein komplexes inputType haben, ist 'input' hier obligatorisch.
		input: z.infer<typeof UserTrpcRouter.processAllTypes_InputSchema>, // siehe Hilfsschema unten
		// ctx: TRPCContext // ctx kann optional sein, wenn nicht gebraucht
	): Promise<z.infer<typeof UserTrpcRouter.processAllTypes_OutputSchema>> {
		// siehe Hilfsschema
		console.log("Backend: user.processAllTypes called with input:", input);

		// Einfache Implementierung, die die Input-Werte verwendet, um das Output-Objekt zu erstellen
		return {
			receivedString: `Eingabe: ${input.myString}`,
			processedNumber: input.myNumber * 2,
			echoedBigInt: input.myBigInt,
			toggledBoolean: !input.myBoolean,
			formattedDate: input.myDate.toUTCString(),
			confirmedNull: input.myNull, // wird null sein
			wasUndefined: input.myUndefined === undefined,

			literalEchoString: input.myLiteralString,
			literalEchoNumber: input.myLiteralNumber,
			literalEchoBoolean: input.myLiteralBoolean,

			selectedStringEnum: input.myStringEnum,
			selectedNativeNumericEnum: input.myNativeNumericEnum,
			selectedNativeStringEnum: input.myNativeStringEnum,

			structuredObject: {
				originalId: input.myObject.nestedId,
				computedValue: `Nested: ${input.myObject.nestedValue || "N/A"}`,
				deepStatus:
					input.myObject.deeplyNested.deepValue === null
						? null
						: "Checked",
			},
			stringArrayLength: input.myStringArray.length,
			sumOfNumbers: input.myNumberArray.reduce((a, b) => a + b, 0),
			objectArrayCount: input.myObjectArray?.length,
			tupleValues: {
				val1: input.myTuple[0],
				val2: input.myTuple[1],
				val3: input.myTuple[2],
			},
			optionalStringPresent: input.myOptionalString !== undefined,
			isNumberNull: input.myNullableNumber === null,
			defaultedString: input.myStringWithDefault, // Zod kümmert sich um den Default bei der Validierung

			unionType: input.myUnion,
			discriminatedUnionEcho: input.myDiscriminatedUnion,
			recordKeys: Object.keys(input.myRecord),

			transformedStringLength: input.myTransformedString, // Dies ist bereits die transformierte Zahl
			refinedNumberPassthrough: input.myRefinedNumber,
		};
	}

	// Hilfsschemas für Typsicherheit in der Implementierung (optional, aber gute Praxis)
	// Diese müssen außerhalb der Klasse oder als statische Member definiert werden,
	// damit z.infer in den Methodensignaturen funktioniert, wenn die Schemas komplex werden.
	// Oder direkt die inline Schemas im Decorator für z.infer verwenden, was aber unübersichtlich wird.
	// Für den Decorator bleiben die Schemas inline wie oben.
	// Diese hier sind nur für die Typsicherheit der *Implementierung*.
	static readonly processAllTypes_InputSchema = z.object({
		myString: z.string().min(3).max(50),
		myNumber: z.number().int().positive(),
		myBigInt: z.bigint().optional(),
		myBoolean: z.boolean(),
		myDate: z.date(),
		myNull: z.null(),
		myUndefined: z.undefined(),
		myLiteralString: z.literal("HalloWelt"),
		myLiteralNumber: z.literal(42),
		myLiteralBoolean: z.literal(true),
		myStringEnum: z.enum(["Apfel", "Birne", "Orange"]),
		myNativeNumericEnum: z.nativeEnum(TestNativeNumericEnum),
		myNativeStringEnum: z.nativeEnum(TestNativeStringEnum).optional(),
		myObject: z.object({
			nestedId: z.string().uuid(),
			nestedValue: z.string().optional(),
			deeplyNested: z.object({ deepValue: z.number().nullable() }),
		}),
		myStringArray: z.array(z.string()).nonempty(),
		myNumberArray: z.array(z.number()),
		myObjectArray: z
			.array(z.object({ id: z.number(), prop: z.string().nullable() }))
			.optional(),
		myTuple: z.tuple([z.string(), z.number(), z.boolean().optional()]),
		myUnion: z.union([z.string().email(), z.number().max(10)]),
		myDiscriminatedUnion: z.discriminatedUnion("kind", [
			z.object({ kind: z.literal("a"), valueA: z.string() }),
			z.object({ kind: z.literal("b"), valueB: z.number() }),
		]),
		myOptionalString: z.string().optional(),
		myNullableNumber: z.number().nullable(),
		myStringWithDefault: z.string().default("Standardwert"),
		myRecord: z.record(z.string().startsWith("key_"), z.boolean()),
		myTransformedString: z.string().transform((val) => val.length),
		myRefinedNumber: z.number().refine((n) => n > 10),
	});
	static readonly processAllTypes_OutputSchema = z.object({
		receivedString: z.string(),
		processedNumber: z.number(),
		echoedBigInt: z.bigint().optional(),
		toggledBoolean: z.boolean(),
		formattedDate: z.string(),
		confirmedNull: z.null(),
		wasUndefined: z.boolean(),
		literalEchoString: z.literal("HalloWelt"),
		literalEchoNumber: z.literal(42),
		literalEchoBoolean: z.literal(true),
		selectedStringEnum: z.enum(["Apfel", "Birne", "Orange"]),
		selectedNativeNumericEnum: z.nativeEnum(TestNativeNumericEnum),
		selectedNativeStringEnum: z.nativeEnum(TestNativeStringEnum).optional(),
		structuredObject: z.object({
			originalId: z.string(),
			computedValue: z.string(),
			deepStatus: z.string().nullable(),
		}),
		stringArrayLength: z.number(),
		sumOfNumbers: z.number(),
		objectArrayCount: z.number().optional(),
		tupleValues: z.object({
			val1: z.string(),
			val2: z.number(),
			val3: z.boolean().optional(),
		}),
		optionalStringPresent: z.boolean(),
		isNumberNull: z.boolean(),
		defaultedString: z.string(),
		unionType: z.union([z.string(), z.number()]),
		discriminatedUnionEcho: z.discriminatedUnion("kind", [
			z.object({ kind: z.literal("a"), valueA: z.string() }),
			z.object({ kind: z.literal("b"), valueB: z.number() }),
		]),
		recordKeys: z.array(z.string()),
		lazyNodeId: z.string().uuid().optional(),
		transformedStringLength: z.number(),
		refinedNumberPassthrough: z.number(),
	});
}
