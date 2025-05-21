// next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
	interface Session {
		accessToken?: string;
		user?: {
			id?: string;
		} & DefaultSession["user"];
	}
	// Optional: Erweitere den User-Typ, falls nötig
	// interface User {
	//   customField?: string;
	// }
}

declare module "next-auth/jwt" {
	interface JWT {
		accessToken?: string;
		userId?: string;
	}
}
