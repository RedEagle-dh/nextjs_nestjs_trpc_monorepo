import { Module } from "@nestjs/common";
import { ExampleService } from "./example.service";
import { ExampleTrpcRouter } from "./example.trpc";

/* Import this module in `trpc.module.ts` with the router provided and exported here. */

@Module({
	providers: [ExampleService, ExampleTrpcRouter],
	exports: [ExampleService, ExampleTrpcRouter],
})
export class ExampleModule {}
