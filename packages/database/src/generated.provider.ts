import { createRouter as createGeneratedRouter } from "./generated/routers";

export const ZENSTACK_GENERATED_ROUTER = "ZENSTACK_GENERATED_ROUTER";

export const GeneratedTrpcRouterProvider = {
	provide: ZENSTACK_GENERATED_ROUTER,
	useValue: createGeneratedRouter(),
};
