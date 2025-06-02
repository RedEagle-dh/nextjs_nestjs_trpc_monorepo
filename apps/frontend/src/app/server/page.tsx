import { serverTrpcClient } from "@/utils/server-trpc";
import React from "react";

export const dynamic = "force-dynamic";

const ServerPage = async () => {
	const servermut =
		await serverTrpcClient.user.getHealthcheck.query("server");

	return <div>ServerPage: {servermut.status}</div>;
};

export default ServerPage;
