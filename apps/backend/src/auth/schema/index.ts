import z from "zod";

export type AccessTokenPayload = {
	userId: string;
	email: string;
	name: string;
	role: string;
};

export const loginInputSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

export const logoutInputSchema = z.object({
	userId: z.string(),
	accessToken: z.string(),
	refreshToken: z.string(),
});

export const tokenOutputSchema = z.object({
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

export type TokenOutput = z.infer<typeof tokenOutputSchema>;

export type LockfileInput = TokenOutput & {
	oldRefreshToken: string;
};

export const refreshTokenInputSchema = z.object({
	userId: z.string(),
	accessToken: z.string().optional(),
	refreshToken: z.string(),
});

export const verifyOtpInputSchema = z.object({
	verificationId: z.string(),
	otp: z.string().length(6),
});

export const registerInputSchema = z
	.object({
		name: z
			.string()
			.min(2, { message: "Name muss mindestens 2 Zeichen lang sein." }),
		email: z
			.string()
			.email({ message: "Bitte gib eine gültige E-Mail an." }),
		password: z.string().min(8, {
			message: "Passwort muss mindestens 8 Zeichen lang sein.",
		}),
		passwordConfirmation: z.string(),
		termsAccepted: z.literal(true, {
			errorMap: () => ({
				message:
					"Du musst den AGB und der Datenschutzerklärung zustimmen.",
			}),
		}),
		captchaToken: z
			.string()
			.min(1, { message: "Bitte bestätige, dass du kein Roboter bist." }),
	})
	.refine((data) => data.password === data.passwordConfirmation, {
		message: "Die Passwörter stimmen nicht überein.",
		path: ["passwordConfirmation"],
	});

export const registerOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	role: z.string(),
});
