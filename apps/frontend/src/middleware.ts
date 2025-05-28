import { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";
import { auth, signOut } from "./auth";

const publicPaths = ["/", "/auth/login", "/auth/register"];

const protectedPaths = [""];

const adminPaths = ["/admin"];

export default auth((request: NextAuthRequest) => {
	const { pathname } = request.nextUrl;

	if (publicPaths.includes(pathname)) {
		return NextResponse.next();
	}

	const session = request.auth;

	if (!session) {
		return NextResponse.redirect(new URL("/auth/login", request.url));
	}

	if (Date.parse(session?.expires) <= Date.now()) {
		signOut();
		return NextResponse.redirect(new URL("/auth/login", request.url));
	}

	const role = session?.user?.role;

	if (adminPaths.includes(pathname) && role !== "ADMIN") {
		return NextResponse.redirect(new URL("/unauthorized", request.url));
	}

	return NextResponse.next();
});

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - api (API routes)
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - auth (Auth.js routes)
		 */
		"/((?!api/|_next/static/|_next/image/|favicon\\.ico|auth/|.*\\.svg$|.*\\.json$).*)",
	],
};
