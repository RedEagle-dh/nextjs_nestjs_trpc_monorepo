import { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";
import { auth } from "./auth";

const protectedPaths: string[] = [];

const adminPaths: string[] = [];

export default auth((request: NextAuthRequest) => {
	const { pathname } = request.nextUrl;

	// Allow access to public paths without authentication
	if (!protectedPaths.includes(pathname) && !adminPaths.includes(pathname)) {
		return NextResponse.next();
	}

	const session = request.auth;

	if (!session) {
		return NextResponse.redirect(new URL("/auth/login", request.url));
	}

	// Check if session is expired
	if (session.expires && Date.parse(session.expires) <= Date.now()) {
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
		 */
		"/((?!api/|_next/static/|_next/image/|favicon\\.ico|.*\\.svg$|.*\\.json$).*)",
	],
};
