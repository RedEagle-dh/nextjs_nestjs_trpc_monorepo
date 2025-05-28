import { signOut } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
	try {
		await signOut({ redirect: false });

		const loginUrl = new URL("/", request.url);
		loginUrl.searchParams.set("sessionExpired", "true");

		return NextResponse.redirect(loginUrl);
	} catch (error) {
		console.error("Error during sign out:", error);
		const loginUrl = new URL("/", request.url);
		loginUrl.searchParams.set("logoutError", "true");
		return NextResponse.redirect(loginUrl);
	}
}
