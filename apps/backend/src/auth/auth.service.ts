import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";

export type JWTPayload = {
	id: string;
	username: string;
	picture: string;
};

@Injectable()
export class AuthService {
	private readonly configService: ConfigService;
	private readonly jwtSecret: string;

	constructor(configService: ConfigService) {
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
}
