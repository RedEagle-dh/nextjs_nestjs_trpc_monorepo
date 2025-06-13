import path from "node:path";
import { TrpcContractGenerator } from "./code-generator";

async function run() {
	const generator = new TrpcContractGenerator({
		backendSrcDir: path.resolve(__dirname, "../../../backend/src"),
		backendTsConfig: path.resolve(__dirname, "../../tsconfig.json"),
		outputContractFile: path.resolve(
			__dirname,
			"../../../../packages/database/src/trpc-contract.ts",
		),
		trpcContextImportPath: ".",
		zenstackRouterImportPath: "./generated/routers",
	});
	await generator.generateContract();
}

run().catch((error) => {
	console.error("Generator Error:", error);
	process.exit(1);
});
