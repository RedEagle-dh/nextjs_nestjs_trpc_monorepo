import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";
import { DbModule } from "src/db/db.module";
import { DbService } from "src/db/db.service";
import {
	TrpcProcedure,
	TrpcProcedureParameters,
	TrpcRouter,
} from "src/trpc/decorators";
import { z } from "zod";

export type JWTPayload = {
	id: string;
	email: string;
};

const loginInputSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

const loginOutputSchema = z.object({
	token: z.string(),
});

@Injectable()
@TrpcRouter({ domain: "auth" })
export class AuthService {
	private readonly jwtSecret: string;

	constructor(
		private readonly dbService: DbService,
		private readonly configService: ConfigService,
	) {
		this.configService = configService;
		const jwtSecret = this.configService.get<string>("JWT_SECRET");
		if (!jwtSecret) {
			throw new Error("JWT_SECRET not set");
		}
		this.jwtSecret = jwtSecret;
	}

	encodeToken(payload: JWTPayload): string {
		return jwt.sign(payload, this.jwtSecret, { expiresIn: "1h" });
	}

	decodeToken(token: string): JWTPayload & { iat: number; exp: number } {
		try {
			return jwt.verify(token, this.jwtSecret) as JWTPayload & {
				iat: number;
				exp: number;
			};
		} catch (error) {
			console.error("Error decoding token:", error);
			throw new Error("Invalid token");
		}
	}

	@TrpcProcedure({
		type: "mutation",
		inputType: loginInputSchema,
		outputType: loginOutputSchema,
		isProtected: false,
	})
	async login({
		ctx,
		input,
	}: TrpcProcedureParameters<typeof loginInputSchema>): Promise<
		z.infer<typeof loginOutputSchema>
	> {
		const user = await this.dbService.user.findUnique({
			where: {
				email: input.email,
			},
		});

		if (!user?.email) {
			throw new Error("User not found");
		}
		if (user.password !== input.password) {
			throw new Error("Invalid password");
		}
		const token = this.encodeToken({
			id: user.id,
			email: user.email,
		});

		return {
			token: token,
		};
	}
}
