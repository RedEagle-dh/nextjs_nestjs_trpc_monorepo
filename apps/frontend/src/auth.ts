// auth.ts
import NextAuth, {
	type User as NextAuthUser,
	type NextAuthConfig,
	type Session,
	type DefaultSession,
} from "next-auth"; // Session und DefaultSession importieren
import Credentials from "next-auth/providers/credentials";
import { TRPCClientError, serverTrpcClient } from "./utils/server-trpc"; // Pfad anpassen!

const TOKEN_REFRESH_BUFFER_SECONDS = 60;

export const config: NextAuthConfig = {
	providers: [
		Credentials({
			name: "Credentials",
			credentials: {
				email: {
					label: "Email",
					type: "email",
					placeholder: "test@example.com",
				},
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials): Promise<NextAuthUser | null> {
				const typedCredentials = credentials as {
					email?: string;
					password?: string;
				};
				const { email, password } = typedCredentials;

				if (
					!email ||
					email.trim() === "" ||
					!password ||
					password.trim() === ""
				) {
					throw new Error(
						"Email und Passwort sind erforderlich und dürfen nicht leer sein.",
					);
				}

				try {
					const loginResult =
						await serverTrpcClient.auth.login.mutate({
							email: email,
							password: password,
						});

					if (
						loginResult.accessToken &&
						loginResult.refreshToken &&
						loginResult.user &&
						typeof loginResult.accessTokenExpiresAt === "number"
					) {
						return {
							id: loginResult.user.id,
							email: loginResult.user.email,
							name: loginResult.user.name,
							accessToken: loginResult.accessToken,
							refreshToken: loginResult.refreshToken,
							accessTokenExpiresAt:
								loginResult.accessTokenExpiresAt,
						};
					}
					console.error(
						"Auth.js/authorize: Unvollständige Antwort von tRPC Login (fehlende Token-Daten):",
						loginResult,
					);
					return null;
				} catch (error) {
					console.error(
						"Auth.js/authorize: Fehler beim Aufruf der tRPC Login-Mutation:",
						error,
					);
					if (error instanceof TRPCClientError) {
						console.log(
							"TRPC Error Code:",
							error.data?.code,
							"Message:",
							error.message,
						);
					}
					return null;
				}
			},
		}),
	],
	session: {
		strategy: "jwt",
	},
	callbacks: {
		async jwt({ token, user, account }) {
			// Initialer Login
			if (account && user) {
				return {
					userId: user.id,
					email: user.email,
					name: user.name,
					accessToken: user.accessToken,
					refreshToken: user.refreshToken,
					accessTokenExpiresAt: user.accessTokenExpiresAt,
				};
			}

			// Token noch gültig?
			if (
				token.accessTokenExpiresAt &&
				Date.now() / 1000 <
					token.accessTokenExpiresAt - TOKEN_REFRESH_BUFFER_SECONDS
			) {
				return token;
			}

			// Refresh Token fehlt? -> Fehler
			if (!token.refreshToken) {
				return { ...token, error: "RefreshAccessTokenError" };
			}

			// Versuche Refresh
			try {
				const refreshedTokens =
					await serverTrpcClient.auth.refreshToken.mutate({
						refreshToken: token.refreshToken,
					});
				return {
					...token,
					accessToken: refreshedTokens.accessToken,
					accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
					refreshToken:
						refreshedTokens.refreshToken ?? token.refreshToken,
					error: undefined, // Fehler zurücksetzen
				};
			} catch (error) {
				console.error(
					"Auth.js/jwt: Error refreshing access token:",
					error,
				);
				return {
					...token,
					accessToken: undefined,
					accessTokenExpiresAt: undefined,
					// Optional: refreshToken auch entfernen, wenn er als ungültig betrachtet wird
					// refreshToken: undefined,
					error: "RefreshAccessTokenError",
				};
			}
		},
		async session({ session: originalSessionInput, token }) {
			// Baue das neue Session-Objekt für den Client auf.
			// 'token' ist hier die maßgebliche Quelle nach dem jwt-Callback.
			// 'originalSessionInput' liefert 'expires' und ggf. eine Basis-User-Struktur von NextAuth.

			const newSession: Session = {
				// Typisiere mit deinem erweiterten Session-Typ
				expires: originalSessionInput.expires, // Wichtig: von NextAuth bereitgestellt
				// Initialisiere optionale Felder als undefined oder basierend auf dem Token
				user: undefined,
				accessToken: undefined,
				error: undefined,
			};

			if (token.userId) {
				newSession.user = {
					// Behalte Standardfelder von originalSessionInput.user bei, falls vorhanden und gewünscht
					name: token.name ?? originalSessionInput.user?.name ?? null,
					email:
						token.email ?? originalSessionInput.user?.email ?? null,
					image: originalSessionInput.user?.image ?? null,
					// Überschreibe/Setze die ID aus dem Token
					id: token.userId,
				};
			} else if (originalSessionInput.user) {
				// Falls kein userId im Token, aber die ursprüngliche Session hatte einen User
				// (z.B. für anonyme Sessions, falls du so etwas hättest)
				newSession.user = originalSessionInput.user;
			}
			// Wenn weder token.userId noch originalSessionInput.user existiert, bleibt newSession.user undefined.

			if (token.accessToken) {
				newSession.accessToken = token.accessToken;
			}
			// Wenn token.accessToken undefined ist (z.B. nach Refresh-Fehler), bleibt newSession.accessToken undefined.

			if (token.error) {
				newSession.error = token.error;
			}
			// Wenn token.error undefined ist, bleibt newSession.error undefined.

			return newSession;
		},
	},
	pages: {
		signIn: "/auth/login",
		error: "/",
	},
	secret: process.env.AUTH_SECRET,
	trustHost: process.env.NODE_ENV !== "production",
	debug: process.env.NODE_ENV === "development",
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
