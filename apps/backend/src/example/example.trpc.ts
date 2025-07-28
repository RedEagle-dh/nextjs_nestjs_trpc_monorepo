import { Injectable } from "@nestjs/common";
import {
	TrpcProcedure,
	TrpcProcedureParameters,
	TrpcRouter,
} from "src/trpc/decorators";
import { z } from "zod";
import { ExampleService } from "./example.service";

/* Define the zod schemas for the procedures here or in a separate file */
const SetMessageInputSchema = z.object({
	message: z.string(),
});

const MessageOutputSchema = z.string();
const SecretMessageOutputSchema = z.string();
const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

/* Create the class and decorate it with @Injectable() and @TrpcRouter({ domain: "cExample" }) */
/* !IMPORTANT: You can not have duplicate domain names. If you have a prisma model name that is the same as the domain name, you will get an error */
/* !IMPORTANT: Custom routers MUST use "c" prefix to avoid conflicts with Zenstack-generated routers */

@Injectable()
@TrpcRouter({ domain: "cExample" })
export class ExampleTrpcRouter {
	constructor(private readonly exampleService: ExampleService) {}

	@TrpcProcedure({
		outputType: MessageOutputSchema,
		type: "query",
		isProtected: false,
	})
	getMessage() {
		return this.exampleService.getMessage();
	}

	@TrpcProcedure({
		inputType: SetMessageInputSchema,
		outputType: MessageOutputSchema,
		type: "mutation",
		isProtected: false,
	})
	setMessage(params: TrpcProcedureParameters<typeof SetMessageInputSchema>) {
		this.exampleService.setMessage(params.input.message);
		return this.exampleService.getMessage();
	}

	@TrpcProcedure({
		outputType: SecretMessageOutputSchema,
		type: "query",
		isProtected: true,
	})
	getSecretMessage() {
		return this.exampleService.getSecretMessage();
	}

	@TrpcProcedure({
		outputType: UserSchema,
		type: "query",
		isProtected: false,
	})
	getCurrentUser() {
		return {
			id: "123",
			name: "John Doe",
			email: "john@example.com",
		};
	}

	@TrpcProcedure({
		type: "query",
		isProtected: false,
		outputType: z.string(),
	})
	getManuallyTypedMessage(): string {
		return this.exampleService.getMessage();
	}
}
