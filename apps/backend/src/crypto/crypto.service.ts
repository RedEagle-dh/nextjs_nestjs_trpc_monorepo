import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import { Injectable } from "@nestjs/common";
import { compare, hash } from "bcrypt";

@Injectable()
export class CryptoService {
	private readonly ALGORITHM = "aes-256-gcm";
	private readonly IV_LENGTH = 16;
	private readonly AUTH_TAG_LENGTH = 16;

	/**
	 * Hashes a password using bcrypt.
	 * @param password The plaintext password.
	 * @returns A promise that resolves to the bcrypt hash.
	 */
	async hashPassword(password: string): Promise<string> {
		const saltRounds = 10;
		return hash(password, saltRounds);
	}

	/**
	 * Verifies a plaintext password against a bcrypt hash.
	 * @param password The plaintext password to verify.
	 * @param hash The stored bcrypt hash from the database.
	 * @returns A promise that resolves to true if the password matches, otherwise false.
	 */
	async verifyPassword(password: string, hash: string): Promise<boolean> {
		return compare(password, hash);
	}

	hashToken(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	verifyHash(token: string, hash: string): boolean {
		const tokenHash = this.hashToken(token);
		const tokenHashBuffer = Buffer.from(tokenHash);
		const hashBuffer = Buffer.from(hash);

		if (tokenHashBuffer.length !== hashBuffer.length) {
			return false;
		}

		return timingSafeEqual(tokenHashBuffer, hashBuffer);
	}

	encryptData(data: string, secretKey: string): string {
		const key = createHash("sha256").update(secretKey).digest();

		const iv = randomBytes(this.IV_LENGTH);

		const cipher = createCipheriv(this.ALGORITHM, key, iv);

		const encrypted = Buffer.concat([
			cipher.update(data, "utf8"),
			cipher.final(),
		]);

		const authTag = cipher.getAuthTag();

		return Buffer.concat([iv, authTag, encrypted]).toString("hex");
	}

	decryptData(encryptedDataHex: string, secretKey: string): string | null {
		try {
			const key = createHash("sha256").update(secretKey).digest();

			const encryptedDataBuffer = Buffer.from(encryptedDataHex, "hex");
			const iv = encryptedDataBuffer.subarray(0, this.IV_LENGTH);
			const authTag = encryptedDataBuffer.subarray(
				this.IV_LENGTH,
				this.IV_LENGTH + this.AUTH_TAG_LENGTH,
			);
			const encrypted = encryptedDataBuffer.subarray(
				this.IV_LENGTH + this.AUTH_TAG_LENGTH,
			);

			const decipher = createDecipheriv(this.ALGORITHM, key, iv);

			decipher.setAuthTag(authTag);

			const decrypted = Buffer.concat([
				decipher.update(encrypted),
				decipher.final(),
			]).toString("utf8");

			return decrypted;
		} catch (error) {
			console.error("Decryption failed:", error);
			return null;
		}
	}

	generateOpaqueRefreshToken(): string {
		return randomBytes(40).toString("hex");
	}
}
