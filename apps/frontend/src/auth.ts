import NextAuth, {
	type User as NextAuthUser,
	type NextAuthConfig,
	type Session,
} from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { TRPCClientError, publicServerTrpcClient } from "./utils/server-trpc";

const TOKEN_REFRESH_BUFFER_SECONDS = 15;

/* class Mutex {
	private queue: Array<() => void> = [];
	private locked = false;

	async lock(): Promise<void> {
		return new Promise((resolve) => {
			if (this.locked) {
				this.queue.push(resolve);
			} else {
				this.locked = true;
				resolve();
			}
		});
	}

	unlock(): void {
		if (this.queue.length > 0) {
			const nextResolve = this.queue.shift();
			if (nextResolve) nextResolve();
		} else {
			this.locked = false;
		}
	}
}

const refreshMutex = new Mutex(); */

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
				const { email, password } = credentials as {
					email?: string;
					password?: string;
				};

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
						await publicServerTrpcClient.auth.login.mutate({
							email,
							password,
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
							role: loginResult.user.role,
							accessToken: loginResult.accessToken,
							refreshToken: loginResult.refreshToken,
							accessTokenExpiresAt:
								loginResult.accessTokenExpiresAt,
						};
					}
					return null;
				} catch (error) {
					console.error(
						"Auth.js/authorize: Fehler beim Aufruf der tRPC Login-Mutation",
					);
					if (error instanceof TRPCClientError) {
						console.log("TRPC Error Code:", error.data?.code);
					}
					return null;
				}
			},
		}),
	],
	session: {
		strategy: "jwt",
		maxAge: 7 * 24 * 60 * 60,
	},
	callbacks: {
		async jwt({ token, user, account }) {
			if (account && user) {
				return {
					userId: user.id,
					email: user.email,
					name: user.name,
					accessToken: user.accessToken,
					refreshToken: user.refreshToken,
					accessTokenExpiresAt: user.accessTokenExpiresAt,
					role: user.role,
				};
			}

			try {
				if (
					token.accessTokenExpiresAt &&
					Date.now() / 1000 <
						token.accessTokenExpiresAt -
							TOKEN_REFRESH_BUFFER_SECONDS
				) {
					return token;
				}
				if (!token.refreshToken || !token.userId) {
					return { ...token, error: "RefreshAccessTokenError" };
				}
				const refreshedTokens =
					await publicServerTrpcClient.auth.refreshToken.mutate({
						refreshToken: token.refreshToken,
						userId: token.userId,
						accessToken: token.accessToken,
					});

				return {
					...token,
					accessToken: refreshedTokens.accessToken,
					accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
					refreshToken: refreshedTokens.refreshToken,
					error: undefined,
				};
			} catch (error) {
				return { ...token, error: "RefreshAccessTokenError" };
			}
		},
		async session({ session: originalSessionInput, token }) {
			const newSession: Session = {
				expires: originalSessionInput.expires,
				user: undefined,
				accessToken: undefined,
				error: undefined,
			};

			if (token.userId) {
				newSession.user = {
					name: token.name ?? originalSessionInput.user?.name ?? null,
					email:
						token.email ?? originalSessionInput.user?.email ?? null,
					image: originalSessionInput.user?.image ?? null,
					id: token.userId,
					role: token.role ?? originalSessionInput.user?.role ?? null,
				};
			} else if (originalSessionInput.user) {
				newSession.user = originalSessionInput.user;
			}

			if (token.accessToken) {
				newSession.accessToken = token.accessToken;
			}

			if (token.error) {
				newSession.error = token.error;
			}

			return newSession;
		},
	},
	pages: {
		signIn: "/auth/login",
		error: "/",
	},
	secret: process.env.AUTH_SECRET,
	trustHost: true,
	debug: process.env.NODE_ENV === "development",
	cookies: {
		sessionToken: {
			name: "authjs.session-token",
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure: process.env.NODE_ENV === "production",
			},
		},
	},
	events: {
		signOut: async (message) => {
			if ("token" in message && message.token) {
				const payload = message.token;
				if (
					!payload.accessToken ||
					!payload.refreshToken ||
					!payload.userId
				) {
					return;
				}
				await publicServerTrpcClient.auth.logout.mutate({
					accessToken: payload.accessToken,
					refreshToken: payload.refreshToken,
					userId: payload.userId,
				});
			}
		},
	},
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
