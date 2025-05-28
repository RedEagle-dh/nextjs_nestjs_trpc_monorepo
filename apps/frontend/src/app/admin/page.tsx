"use client";
import { useTRPC } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";

const AdminPage = () => {
	const trpc = useTRPC();
	const hcMutation = useMutation(
		trpc.user.protectedHealthcheck.mutationOptions({
			onSuccess: () => {
				console.log("Healthcheck successful");
			},
			onError: (error) => {
				console.error("Healthcheck failed", error);
			},
		}),
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	React.useEffect(() => {
		hcMutation.mutate({
			healthcheck: "Test",
		});
	}, []);
	return <div>If you are an admin, you can access the admin panel.</div>;
};

export default AdminPage;
