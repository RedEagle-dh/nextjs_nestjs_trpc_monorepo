import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TRPCError } from "@trpc/server";
import * as jwt from "jsonwebtoken";
import { DbService } from "src/db/db.service";
import { RedisService } from "src/redis/redis.service";
import {
	TrpcProcedure,
	TrpcProcedureParameters,
	TrpcRouter,
} from "src/trpc/decorators";
import { z } from "zod";

export type AccessTokenPayload = {
	userId: string;
	email: string;
	// Füge hier weitere Claims hinzu, die im Access Token benötigt werden (z.B. Rollen)
	// Halte den Payload klein!
};

const loginInputSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

const tokenOutputSchema = z.object({
	user: z.object({
		id: z.string(),
		email: z.string(),
		name: z.string(),
	}),
	accessToken: z.string(),
	refreshToken: z.string(),
	accessTokenExpiresAt: z.number(),
});

const refreshTokenInputSchema = z.object({
	refreshToken: z.string(),
});

@Injectable()
@TrpcRouter({ domain: "auth" })
export class AuthService {
	private readonly jwtSecret: string;
	private readonly accessTokenExpiresInString: string;
	private readonly refreshTokenTtlSeconds: number;

	private readonly REFRESH_TOKEN_REDIS_PREFIX = "refreshtoken:";

	constructor(
		private readonly dbService: DbService,
		private readonly configService: ConfigService,
		private readonly redisService: RedisService,
	) {
		this.jwtSecret = this.configService.get<string>("JWT_SECRET") as string;
		this.accessTokenExpiresInString =
			this.configService.get<string>("ACCESS_TOKEN_EXPIRES_IN") || "15m";
		this.refreshTokenTtlSeconds = Number.parseInt(
			this.configService.get<string>(
				"REFRESH_TOKEN_EXPIRES_IN_SECONDS",
			) || (7 * 24 * 60 * 60).toString(),
			10,
		);

		if (!this.jwtSecret) {
			throw new Error("JWT_SECRET not set in configuration.");
		}
	}

	// --- Access Token Methoden ---
	private generateAccessToken(payload: AccessTokenPayload): {
		token: string;
		expiresAt: number;
	} {
		const now = Math.floor(Date.now() / 1000);
		let expiresInSecondsNum: number;
		const unit = this.accessTokenExpiresInString.slice(-1);
		const value = Number.parseInt(
			this.accessTokenExpiresInString.slice(0, -1),
			10,
		);
		switch (unit) {
			case "s":
				expiresInSecondsNum = value;
				break;
			case "m":
				expiresInSecondsNum = value * 60;
				break;
			case "h":
				expiresInSecondsNum = value * 60 * 60;
				break;
			case "d":
				expiresInSecondsNum = value * 60 * 60 * 24;
				break;
			default:
				throw new Error(
					`Invalid format for ACCESS_TOKEN_EXPIRES_IN: ${this.accessTokenExpiresInString}`,
				);
		}

		const expiresAt = now + expiresInSecondsNum;
		const token = jwt.sign(
			{ ...payload, iat: now, exp: expiresAt },
			this.jwtSecret,
		);
		return { token, expiresAt };
	}

	// decodeAccessToken (wird eher in Guards für geschützte Routen benötigt)
	public decodeAccessToken(
		token: string,
	): AccessTokenPayload & { iat: number; exp: number } {
		try {
			return jwt.verify(token, this.jwtSecret) as AccessTokenPayload & {
				iat: number;
				exp: number;
			};
		} catch (error) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid or expired access token",
			});
		}
	}

	// --- Refresh Token Methoden ---
	private generateOpaqueRefreshToken(): string {
		return randomBytes(40).toString("hex");
	}

	private async storeRefreshTokenInRedis(
		userId: string,
		refreshToken: string,
	): Promise<void> {
		const key = `${this.REFRESH_TOKEN_REDIS_PREFIX}${refreshToken}`;
		await this.redisService.set(key, userId, this.refreshTokenTtlSeconds);
	}

	/**
	 * Validiert ein Refresh-Token gegen Redis.
	 * Wenn gültig, wird es aus Redis gelöscht (Rotation) und die userId zurückgegeben.
	 * @param refreshToken Das zu validierende Refresh-Token.
	 * @returns Die userId, wenn das Token gültig war, sonst null.
	 */
	private async validateAndConsumeRefreshTokenFromRedis(
		refreshToken: string,
	): Promise<string | null> {
		const key = `${this.REFRESH_TOKEN_REDIS_PREFIX}${refreshToken}`;
		const userId = await this.redisService.get(key);

		if (!userId) {
			return null;
		}

		await this.redisService.del(key);
		return userId;
	}

	// --- tRPC Prozeduren ---
	@TrpcProcedure({
		type: "mutation",
		inputType: loginInputSchema,
		outputType: tokenOutputSchema,
		isProtected: false,
	})
	async login(
		params: TrpcProcedureParameters<typeof loginInputSchema>,
	): Promise<z.infer<typeof tokenOutputSchema>> {
		const { input } = params;

		const user = await this.dbService.user.findUnique({
			where: { email: input.email },
		});

		const account = await this.dbService.account.findUnique({
			where: { userId: user?.id },
		});

		if (!user) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		if (!account) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Account not found",
			});
		}

		if (account.password !== input.password) {
			console.warn(
				`WARNUNG: Unsicherer Passwortvergleich für User ${user.email}`,
			);
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid password",
			});
		}

		const accessTokenPayload: AccessTokenPayload = {
			userId: user.id,
			email: user.email,
		};
		const { token: accessToken, expiresAt: accessTokenExpiresAt } =
			this.generateAccessToken(accessTokenPayload);
		const refreshToken = this.generateOpaqueRefreshToken();
		await this.storeRefreshTokenInRedis(user.id, refreshToken);

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
			accessToken,
			refreshToken,
			accessTokenExpiresAt,
		};
	}

	@TrpcProcedure({
		type: "mutation",
		inputType: refreshTokenInputSchema,
		outputType: tokenOutputSchema,
		isProtected: false,
	})
	async refreshToken(
		params: TrpcProcedureParameters<typeof refreshTokenInputSchema>,
	): Promise<z.infer<typeof tokenOutputSchema>> {
		const { input } = params;
		const oldRefreshToken = input.refreshToken;

		const userId =
			await this.validateAndConsumeRefreshTokenFromRedis(oldRefreshToken);
		if (!userId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid, expired, or already used refresh token.",
			});
		}

		const user = await this.dbService.user.findUnique({
			where: { id: userId },
		});
		if (!user) {
			// Sollte nicht passieren, wenn das Refresh-Token gültig war und einem User zugeordnet ist.
			// Könnte passieren, wenn der User zwischenzeitlich gelöscht wurde.
			await this.redisService.del(
				`${this.REFRESH_TOKEN_REDIS_PREFIX}${oldRefreshToken}`,
			); // Vorsichtshalber löschen, falls nicht schon geschehen
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "User associated with refresh token not found.",
			});
		}

		// Neue Tokens generieren
		const accessTokenPayload: AccessTokenPayload = {
			userId: user.id,
			email: user.email,
		};
		const { token: newAccessToken, expiresAt: newAccessTokenExpiresAt } =
			this.generateAccessToken(accessTokenPayload);
		const newRefreshToken = this.generateOpaqueRefreshToken();
		await this.storeRefreshTokenInRedis(user.id, newRefreshToken); // Neues Refresh-Token speichern

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
			accessToken: newAccessToken,
			refreshToken: newRefreshToken,
			accessTokenExpiresAt: newAccessTokenExpiresAt,
		};
	}
}
