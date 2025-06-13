import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const supportedLocales = ["de", "en"] as const;
type Locale = (typeof supportedLocales)[number];

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
	let locale: Locale | undefined = supportedLocales.includes(
		cookieLocale as Locale,
	)
		? (cookieLocale as Locale)
		: undefined;

	if (!locale) {
		const requestHeaders = await headers();
		const accept = requestHeaders.get("accept-language") ?? "";
		const langParts = accept.split(",");
		if (langParts.length > 0 && langParts[0]) {
			const subParts = langParts[0].split("-");
			const lang = subParts.length > 0 ? subParts[0] : "";
			if (supportedLocales.includes(lang as Locale)) {
				locale = lang as Locale;
			}
		}
	}

	if (!locale) {
		locale = "de";
	}

	const { default: messages } = await import(`../../messages/${locale}.json`);
	return { locale, messages, timeZone: "Europe/Berlin" };
});
