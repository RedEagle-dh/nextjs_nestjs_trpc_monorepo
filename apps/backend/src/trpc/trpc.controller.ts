import { All, Controller, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { TRPCService } from "./trpc.service";

@Controller("trpc")
export class TRPCController {
	constructor(private readonly trpcService: TRPCService) {}

	@All("*path")
	async handleTRPC(@Req() req: Request, @Res() res: Response) {
		return this.trpcService.handleRequest(req, res);
	}
}
