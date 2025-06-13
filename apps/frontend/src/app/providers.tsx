"use client";

import { NextIntlClientProvider } from "next-intl";

export default function Providers({
	children,
	messages,
}: {
	children: React.ReactNode;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	messages: Record<string, any>;
}) {
	return (
		<NextIntlClientProvider
			messages={messages}
			locale="de"
			timeZone="Europe/Berlin"
		>
			{children}
		</NextIntlClientProvider>
	);
}
