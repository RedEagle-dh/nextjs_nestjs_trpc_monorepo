import * as path from "node:path";
import { TrpcContractGenerator } from "./code-generator"; // Angepasster Importpfad

async function run() {
	const generator = new TrpcContractGenerator({
		backendSrcDir: path.resolve(__dirname, "../../../backend/src"),
		backendTsConfig: path.resolve(__dirname, "../../tsconfig.json"),
		outputContractFile: path.resolve(
			__dirname,
			"../../../../packages/trpc/trpc-contract.ts",
		),
		trpcContextImportPath: "./server.ts", // Relativ zur generierten Datei
	});
	await generator.generateContract();
}

run().catch((error) => {
	console.error("Generator Error:", error);
	process.exit(1);
});
