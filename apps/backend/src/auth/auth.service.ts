import { randomBytes } from "node:crypto";
import { TRPCContext } from "@mono/trpc-server/dist/server";
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
	role: string;
};

const loginInputSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

const logoutInputSchema = z.object({
	userId: z.string(),
	accessToken: z.string(),
	refreshToken: z.string(),
});

const tokenOutputSchema = z.object({
	user: z.object({
		id: z.string(),
		email: z.string(),
		name: z.string(),
		role: z.string(),
	}),
	accessToken: z.string(),
	refreshToken: z.string(),
	accessTokenExpiresAt: z.number(),
});

const refreshTokenInputSchema = z.object({
	userId: z.string(),
	accessToken: z.string().optional(),
	refreshToken: z.string(),
});

@Injectable()
@TrpcRouter({ domain: "auth" })
export class AuthService {
	private readonly jwtSecret: string;
	private readonly accessTokenExpiresInString: string;
	private readonly accessTokenTtlSeconds: number;
	private readonly refreshTokenTtlSeconds: number;

	private readonly REFRESH_TOKEN_REDIS_PREFIX = "refreshtoken:";
	private readonly ACCESS_TOKEN_REDIS_PREFIX = "accesstoken:";

	constructor(
		private readonly dbService: DbService,
		private readonly configService: ConfigService,
		private readonly redisService: RedisService,
	) {
		this.jwtSecret = this.configService.get<string>("JWT_SECRET") as string;
		this.accessTokenExpiresInString =
			this.configService.get<string>("ACCESS_TOKEN_EXPIRES_IN") || "1h";
		this.accessTokenTtlSeconds = Number.parseInt(
			this.configService.get<string>("ACCESS_TOKEN_EXPIRES_IN_SECONDS") ||
				(1 * 60 * 60).toString(),
			10,
		);
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
	private generateAccessToken(payload: {
		userId: string;
		email: string;
		role: string;
	}): {
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
	public async decodeAccessToken(token: string): Promise<
		AccessTokenPayload & {
			iat: number;
			exp: number;
			rawAccessToken: string;
		}
	> {
		try {
			const payload = jwt.verify(
				token,
				this.jwtSecret,
			) as AccessTokenPayload & {
				iat: number;
				exp: number;
				rawAccessToken: string;
			};

			const userId = payload.userId;
			const storedAccessToken = await this.redisService.get(
				`${this.ACCESS_TOKEN_REDIS_PREFIX}${userId}:${token}`,
			);

			if (!storedAccessToken) {
				throw new Error("Access token not found in Redis");
			}

			payload.rawAccessToken = token;
			return payload;
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

	private async storeTokensInRedis({
		accessToken,
		refreshToken,
		userId,
	}: {
		accessToken: string;
		refreshToken: string;
		userId: string;
	}): Promise<void> {
		const accessTokenKey = `${this.ACCESS_TOKEN_REDIS_PREFIX}${userId}:${accessToken}`;
		const refreshTokenKey = `${this.REFRESH_TOKEN_REDIS_PREFIX}${userId}:${refreshToken}`;
		await this.redisService.set(
			accessTokenKey,
			accessToken,
			this.accessTokenTtlSeconds,
		);
		await this.redisService.set(
			refreshTokenKey,
			userId,
			this.refreshTokenTtlSeconds,
		);
	}

	/**
	 * Validiert ein Refresh-Token gegen Redis.
	 * Wenn gültig, wird es aus Redis gelöscht (Rotation) und die userId zurückgegeben.
	 * @param refreshToken Das zu validierende Refresh-Token.
	 * @returns Die userId, wenn das Token gültig war, sonst null.
	 */
	private async validateAndConsumeTokensFromRedis(
		refreshToken: string,
		userId: string,
		accessToken?: string,
	): Promise<string | null> {
		const rtKey = `${this.REFRESH_TOKEN_REDIS_PREFIX}${userId}:${refreshToken}`;
		const atKey = `${this.ACCESS_TOKEN_REDIS_PREFIX}${userId}:${accessToken}`;
		const storedUserId = await this.redisService.get(rtKey);

		if (!storedUserId || !userId) {
			return null;
		}

		await this.redisService.del(rtKey);
		await this.redisService.del(atKey);
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

		// TODO : Passwort-Hashing und -Verifizierung
		if (account.password !== input.password) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid password",
			});
		}

		const accessTokenPayload: AccessTokenPayload = {
			userId: user.id,
			email: user.email,
			role: user.role,
		};
		const { token: accessToken, expiresAt: accessTokenExpiresAt } =
			this.generateAccessToken(accessTokenPayload);
		const refreshToken = this.generateOpaqueRefreshToken();

		await this.storeTokensInRedis({
			accessToken,
			refreshToken,
			userId: user.id,
		});

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
			accessToken,
			refreshToken: refreshToken,
			accessTokenExpiresAt,
		};
	}

	@TrpcProcedure({
		type: "mutation",
		inputType: logoutInputSchema,
		outputType: z.object({
			status: z.number(),
		}),
		isProtected: false,
	})
	async logout({
		input,
		ctx,
	}: {
		input: z.infer<typeof logoutInputSchema>;
		ctx: TRPCContext;
	}) {
		await this.redisService.del([
			`${this.ACCESS_TOKEN_REDIS_PREFIX}${input.userId}:${input.accessToken}`,
			`${this.REFRESH_TOKEN_REDIS_PREFIX}${input.userId}:${input.refreshToken}`,
		]);
		return {
			status: 200,
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

		const existingHelper = await this.redisService.getJson(
			`refreshhelper:${oldRefreshToken}`,
		);

		if (existingHelper) {
			return existingHelper;
		}

		const userId = await this.validateAndConsumeTokensFromRedis(
			oldRefreshToken,
			input.userId,
			input.accessToken,
		);
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
			await this.redisService.del(
				`${this.REFRESH_TOKEN_REDIS_PREFIX}${oldRefreshToken}`,
			);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "User associated with refresh token not found.",
			});
		}

		const accessTokenPayload = {
			userId: user.id,
			email: user.email,
			role: user.role,
		};

		const { token: newAccessToken, expiresAt: newAccessTokenExpiresAt } =
			this.generateAccessToken(accessTokenPayload);
		const newRefreshToken = this.generateOpaqueRefreshToken();
		await this.storeTokensInRedis({
			accessToken: newAccessToken,
			refreshToken: newRefreshToken,
			userId: user.id,
		});
		await this.redisService.setJson(
			`refreshhelper:${oldRefreshToken}`,
			{
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role,
				},
				accessToken: newAccessToken,
				refreshToken: newRefreshToken,
				accessTokenExpiresAt: newAccessTokenExpiresAt,
			},
			2,
		);

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
			accessToken: newAccessToken,
			refreshToken: newRefreshToken,
			accessTokenExpiresAt: newAccessTokenExpiresAt,
		};
	}
}
