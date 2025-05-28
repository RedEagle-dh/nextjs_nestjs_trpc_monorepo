"use client";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { useState } from "react";

export default function Home() {
	const [h, setH] = useState("");
	const { data: session } = useSession();

	return (
		<div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
			<main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
				{session?.user.name ?? "Guest"}
				<Image
					className="dark:invert"
					src="/next.svg"
					alt="Next.js logo"
					width={180}
					height={38}
					priority
				/>
				<button
					type="button"
					className="bg-white border-2 border-green-300 text-black"
					onClick={() =>
						signIn("credentials", {
							email: "test@example.com",
							password: "password",
						})
					}
				>
					Login
				</button>
				<button
					type="button"
					className="bg-white border-2 border-green-300 text-black"
					onClick={() =>
						signOut({
							redirect: true,
							redirectTo: "/",
						})
					}
				>
					LogOut
				</button>
				{/* {session?.user.name} */}
			</main>
		</div>
	);
}
