import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { TRPCClientError, serverTrpcClient } from "./utils/server-trpc";

export const { handlers, signIn, signOut, auth } = NextAuth({
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
			async authorize(credentials) {
				if (
					!credentials ||
					typeof credentials.email !== "string" ||
					credentials.email.trim() === "" ||
					typeof credentials.password !== "string" ||
					credentials.password.trim() === ""
					// Du könntest hier noch credentials.csrfToken prüfen, falls du es verwendest
				) {
					console.error(
						"Auth.js/authorize: Gültige E-Mail und Passwort sind erforderlich.",
					);
					// throw new Error("Gültige E-Mail und Passwort sind erforderlich."); // Führt zu Fehlerseite
					return null; // Signalisiert Login-Fehler
				}

				const { email, password } = credentials;
				if (!email || !password) {
					throw new Error("Email and password are required");
				}

				try {
					const loginResult =
						await serverTrpcClient.auth.login.mutate({
							email: email,
							password: password,
						});

					if (loginResult?.token) {
						return {
							// Dieses Objekt wird an den 'jwt'-Callback weitergegeben
							id: "1",
							name: "Max Mustermann",
							email: email,
							accessToken: loginResult.token, // Dein Backend-Token
						};
					}
					console.error(
						"Auth.js/authorize: Unerwartete oder unvollständige Antwort von tRPC Login-Mutation:",
						loginResult,
					);
					return null;
				} catch (error) {
					console.error(
						"Auth.js/authorize: Fehler beim Aufruf der tRPC Login-Mutation:",
						error,
					);
					if (error instanceof TRPCClientError) {
						// Hier könntest du spezifische tRPC-Fehlercodes behandeln
						// z.B. wenn dein Backend bei falschen Credentials einen 'UNAUTHORIZED'-Fehler wirft.
						// In den meisten Fällen führt das aber auch einfach zu 'return null;'.
						console.log(
							"TRPC Error Code:",
							error.data?.code,
							"Message:",
							error.message,
						);
					}
					return null; // Signalisiert Login-Fehler
				}
			},
		}),
	],
	session: {
		strategy: "jwt",
	},
	callbacks: {
		async jwt({ token, user, account, profile }) {
			if (user) {
				// @ts-ignore
				token.accessToken = user.accessToken;
				token.userId = user.id;
			}
			return token;
		},
		async session({ session, token }) {
			if (token.accessToken) {
				session.accessToken = token.accessToken as string;
			}
			if (token.userId && session.user) {
				session.user.id = token.userId as string;
			}
			return session;
		},
	},
	pages: {
		signIn: "/auth/login",
	},
	secret: process.env.AUTH_SECRET,
	trustHost: true,
});
