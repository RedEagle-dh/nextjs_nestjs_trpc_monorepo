import type { NextConfig } from "next";

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
	output: "standalone",
	rewrites: async () => [
		{
			source: "/api/trpc/:path*",
			destination: `${process.env.NEXT_PUBLIC_BACKEND_URL}/trpc/:path*`,
		},
	],
};

export default withNextIntl(nextConfig);
