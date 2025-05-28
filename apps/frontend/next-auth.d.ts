import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
	interface Session {
		accessToken?: string;
		user?: {
			id?: string;
			email?: string | null;
			name?: string | null;
			role?: string;
		} & DefaultSession["user"];
		error?: "RefreshAccessTokenError";
	}

	interface User {
		id: string;
		email: string;
		name: string;
		accessToken: string;
		refreshToken: string;
		accessTokenExpiresAt: number;
		role?: string;
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		user?: {
			id?: string;
			email?: string | null;
			name?: string | null;
			role?: string;
		};
		accessToken?: string;
		refreshToken?: string;
		accessTokenExpiresAt?: number;
		userId?: string;
		error?: "RefreshAccessTokenError";
	}
}
