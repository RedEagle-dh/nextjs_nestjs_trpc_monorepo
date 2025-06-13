import type { Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../styles/globals.css";
import { cn } from "@/lib/utils";
import { ReactTRPCProvider } from "@/utils/react-trpc";
import { SessionProvider } from "next-auth/react";
import { getLocale, getMessages } from "next-intl/server";
import Providers from "./providers";

const font = Plus_Jakarta_Sans({
	subsets: ["latin"],
	display: "swap",
});

export const viewport: Viewport = {
	themeColor: "#ffffff",
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html
			lang={locale}
			className={cn(font.className, "scroll-pt-[50px] scroll-smooth")}
		>
			<body className="bg-stone-50">
				<SessionProvider>
					<ReactTRPCProvider>
						<Providers messages={messages}>{children}</Providers>
					</ReactTRPCProvider>
				</SessionProvider>
			</body>
		</html>
	);
}
