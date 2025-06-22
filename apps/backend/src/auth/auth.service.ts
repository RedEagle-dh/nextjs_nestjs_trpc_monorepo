import { randomBytes } from "node:crypto";
import { TRPCContext } from "@mono/database";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { toDataURL } from "qrcode";
import { CryptoService } from "src/crypto/crypto.service";
import { DbService } from "src/db/db.service";
import { RedisService } from "src/redis/redis.service";
import { TrpcProcedureParameters } from "src/trpc/decorators";
import { z } from "zod";
import {
	AccessTokenPayload,
	loginInputSchema,
	logoutInputSchema,
	refreshTokenInputSchema,
	tokenOutputSchema,
} from "./schema";

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);
	private readonly jwtSecret: string;
	private readonly accessTokenExpiresInString: string;
	private readonly accessTokenTtlSeconds: number;
	private readonly refreshTokenTtlSeconds: number;
	private readonly ENCRYPTION_KEY: string;

	private readonly REFRESH_TOKEN_REDIS_PREFIX = "refreshtoken:";
	private readonly ACCESS_TOKEN_REDIS_PREFIX = "accesstoken:";
	private readonly VERIFY_SESSION_PREFIX = "verify-session:";

	constructor(
		private readonly dbService: DbService,
		private readonly configService: ConfigService,
		private readonly redisService: RedisService,
		private readonly cryptoService: CryptoService,
	) {
		const encriptionKey = this.configService.get<string>("ENCRYPTION_KEY");
		if (!encriptionKey) {
			throw new Error("ENCRYPTION_KEY not set in configuration.");
		}

		this.ENCRYPTION_KEY = encriptionKey;

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

	async login(
		params: TrpcProcedureParameters<typeof loginInputSchema>,
	): Promise<z.infer<typeof tokenOutputSchema>> {
		console.log("Calling login service");
		const { input } = params;
		const user = await this.dbService.user.findUnique({
			where: { email: input.email },
		});

		if (!user) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		const account = await this.dbService.account.findUnique({
			where: { userId: user?.id },
		});

		if (!account) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Account not found",
			});
		}

		if (!account.isVerified) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message:
					"Dein Account ist noch nicht verifiziert. Bitte überprüfe deine E-Mails.",
			});
		}

		const passwordValid = await this.cryptoService.verifyPassword(
			input.password,
			account.password,
		);

		if (passwordValid === false) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid password",
			});
		}

		const accessTokenPayload: AccessTokenPayload = {
			userId: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
		};

		const { accessToken, accessTokenExpiresAt, refreshToken } =
			this.generateAndStoreAccessTokens(accessTokenPayload);

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
			accessToken,
			refreshToken,
			accessTokenExpiresAt,
		};
	}

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

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async refreshToken(params): Promise<z.infer<typeof tokenOutputSchema>> {
		const startTime = Date.now();
		const { input } = params;
		const lockKey = `token_refresh_lock:${input.userId}`;
		const resultKey = `refresh_result:${input.userId}:${input.refreshToken}`;

		this.logger.debug(
			`[${input.userId}] Attempting to acquire lock with token ${input.refreshToken.substring(0, 10)}...`,
		);

		const existingResult = await this.redisService.getJson(resultKey);
		if (existingResult && this.isResultFresh(existingResult)) {
			this.logger.debug(
				`[${input.userId}] Returning cached result for this specific token (age: ${Date.now() - existingResult.timestamp}ms)`,
			);
			const { timestamp, ...cleanResult } = existingResult;
			return cleanResult;
		}

		const lockAcquired = await this.redisService.set(
			lockKey,
			input.refreshToken,
			10,
			"NX",
		);

		if (!lockAcquired) {
			return await this.waitForRefreshResult(
				input.userId,
				input.refreshToken,
			);
		}

		try {
			const doubleCheckResult =
				await this.redisService.getJson(resultKey);
			if (doubleCheckResult && this.isResultFresh(doubleCheckResult)) {
				const { timestamp, ...cleanResult } = doubleCheckResult;
				return cleanResult;
			}

			const result = await this.performActualRefresh(params);

			const resultWithTimestamp = {
				...result,
				timestamp: Date.now(),
			};

			await this.redisService.setJson(resultKey, resultWithTimestamp, 5);

			return result;
		} catch (error) {
			this.logger.error(
				`[${input.userId}] Token refresh failed after ${Date.now() - startTime}ms`,
				error,
			);
			throw error;
		} finally {
			this.logger.debug(
				`[${input.userId}] Releasing lock after ${Date.now() - startTime}ms`,
			);
			const lockValue = await this.redisService.get(lockKey);
			if (lockValue === input.refreshToken) {
				await this.redisService.del(lockKey);
				this.logger.debug(`[${input.userId}] Lock released`);
			} else {
				this.logger.debug(
					`[${input.userId}] Lock already taken by different token, not releasing`,
				);
			}
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	private isResultFresh(result: any): boolean {
		if (!result || !result.timestamp) return false;

		const age = Date.now() - result.timestamp;
		const isFresh = age < 5000; // 5 Sekunden

		return isFresh;
	}

	private async waitForRefreshResult(
		userId: string,
		refreshToken: string,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	): Promise<any> {
		const resultKey = `refresh_result:${userId}:${refreshToken}`;

		this.logger.debug(
			`[${userId}] Waiting for refresh result for specific token`,
		);

		for (let i = 0; i < 30; i++) {
			await this.sleep(200);

			const result = await this.redisService.getJson(resultKey);
			if (result && this.isResultFresh(result)) {
				this.logger.debug(
					`[${userId}] Found cached result after ${i * 200}ms wait`,
				);
				const { timestamp, ...cleanResult } = result;
				return cleanResult;
			}
		}

		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Token refresh timeout - please try again",
		});
	}

	private async performActualRefresh(
		params: TrpcProcedureParameters<typeof refreshTokenInputSchema>,
	) {
		this.logger.debug(
			`Performing actual token refresh for user ${params.input.userId} with refresh token ${params.input.refreshToken}`,
		);
		const { input } = params;
		const oldRefreshToken = input.refreshToken;

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
			name: user.name,
			role: user.role,
		};

		const { accessToken, accessTokenExpiresAt, refreshToken } =
			this.generateAndStoreAccessTokens(accessTokenPayload);

		const data = {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
			accessToken,
			oldRefreshToken,
			refreshToken,
			accessTokenExpiresAt,
		};

		return data;
	}

	generateAndStoreAccessTokens(payload: AccessTokenPayload): {
		accessToken: string;
		refreshToken: string;
		accessTokenExpiresAt: number;
	} {
		const { token: accessToken, expiresAt: accessTokenExpiresAt } =
			this.generateAccessToken(payload);
		const refreshToken = this.cryptoService.generateOpaqueRefreshToken();

		// Das Speichern in Redis geschieht asynchron im Hintergrund.
		// Wir müssen nicht darauf warten, um die Tokens an den User zurückzugeben.
		this.storeTokensInRedis({
			accessToken,
			refreshToken,
			userId: payload.userId,
		}).catch((err) => {
			this.logger.error(
				`Failed to store tokens in Redis for user ${payload.userId}`,
				err,
			);
		});

		return {
			accessToken,
			refreshToken,
			accessTokenExpiresAt,
		};
	}

	async generateAndStoreOtp(user: {
		id: string;
		email: string;
		role: string;
	}) {
		try {
			const otp = await this.generateOtpCode();
			const verificationId = randomBytes(24).toString("hex");
			const redisKey = `${this.VERIFY_SESSION_PREFIX}${verificationId}`;
			const TTL = 60 * 15;
			await this.redisService.setJson(
				redisKey,
				{
					otp,
					userId: user.id,
				},
				TTL,
			);
			return {
				otp,
				verificationId,
			};
		} catch (error) {
			this.logger.error("Error generating and storing OTP Token", error);
			return null;
		}
	}

	async generateOtpCode(): Promise<string> {
		const otpCode = randomBytes(3).toString("hex").toUpperCase();
		return otpCode;
	}

	async generateTwoFactorSecret(user: { id: string; email: string }) {
		// 1. Ein neues Geheimnis generieren
		const secret = authenticator.generateSecret();

		// 2. Das Geheimnis verschlüsseln, bevor es gespeichert wird
		const encryptedSecret = this.cryptoService.encryptData(
			secret,
			this.ENCRYPTION_KEY,
		);

		// 3. Das verschlüsselte Geheimnis in der DB speichern
		await this.dbService.account.update({
			where: { userId: user.id },
			data: { totpSecret: encryptedSecret },
		});

		// 4. Die URL für den QR-Code erstellen
		const otpauthUrl = authenticator.keyuri(
			user.email,
			"N2 StickStoff",
			secret,
		);

		return {
			secret,
			otpauthUrl,
		};
	}

	async isTwoFactorCodeValid(
		twoFactorCode: string,
		userId: string,
	): Promise<boolean> {
		const user = await this.dbService.account.findUnique({
			where: { userId: userId },
		});

		if (!user || !user.totpSecret) {
			return false;
		}

		const decryptedSecret = this.cryptoService.decryptData(
			user.totpSecret,
			this.ENCRYPTION_KEY,
		);

		if (!decryptedSecret) {
			return false;
		}

		// 2. Den Code mit otplib verifizieren
		return authenticator.verify({
			token: twoFactorCode,
			secret: decryptedSecret,
		});
	}

	async generateQrCodeDataURL(otpAuthUrl: string): Promise<string> {
		return toDataURL(otpAuthUrl);
	}

	public async verifyOtpAndActivateAccount(input: {
		verificationId: string;
		otp: string;
	}): Promise<{ message: string }> {
		const redisKey = `${this.VERIFY_SESSION_PREFIX}${input.verificationId}`;
		const sessionData = await this.redisService.getJson<{
			otp: string;
			userId: string;
		}>(redisKey);

		if (!sessionData || sessionData.otp !== input.otp) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Ungültiger oder abgelaufener Code.",
			});
		}

		await this.dbService.account.update({
			where: { userId: sessionData.userId },
			data: { isVerified: true },
		});

		await this.redisService.del(redisKey);

		return { message: "Account erfolgreich aktiviert." };
	}

	public async checkVerificationId(
		verificationId: string,
	): Promise<{ isValid: boolean }> {
		const redisKey = `${this.VERIFY_SESSION_PREFIX}${verificationId}`;
		const exists = await this.redisService.exists(redisKey);
		return { isValid: exists === 1 };
	}
}
