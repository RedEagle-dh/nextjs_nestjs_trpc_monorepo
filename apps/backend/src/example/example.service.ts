import { Injectable } from "@nestjs/common";

@Injectable()
export class ExampleService {
	private message = "Hello World!";

	getMessage(): string {
		return this.message;
	}

	setMessage(message: string): void {
		this.message = message;
	}

	getSecretMessage(): string {
		return "You found this secret message! Congratulations! You are a true detective! (jk, you are just authenticated)";
	}
}
