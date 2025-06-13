import { publicServerTrpcClient } from "@/utils/server-trpc";

export default async function Home() {
	const { status, timestamp } =
		await publicServerTrpcClient.healthcheck.getHealthcheck.query("test");

	return (
		<div className="flex flex-col items-center justify-center min-h-screen">
			<h1 className="text-7xl font-bold">Welcome to the TRPC Example!</h1>
			<p className="mt-2 text-3xl">
				This is a simple example of using TRPC with Next.js.
			</p>
			<p className="mt-6 text-2xl">TRPC Response from Nest.js:</p>
			<p className="mt-4">Status: {status}</p>
			<p className="mt-2">Timestamp: {timestamp}</p>

			<p className="mt-6">
				You can find the source code on{" "}
				<a
					href="https://github.com/RedEagle-dh/t3_nest_turborepo"
					className="text-blue-500 hover:underline"
				>
					GitHub
				</a>
			</p>
		</div>
	);
}
