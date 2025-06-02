import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	webpack(config) {
		config.resolve.alias["@mono/trpc/"] = path.resolve(
			__dirname,
			"../../packages/trpc",
		);
		return config;
	},
};

export default nextConfig;
