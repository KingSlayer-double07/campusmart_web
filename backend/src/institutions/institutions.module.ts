import { Module } from "@nestjs/common";
import { InstitutionsController } from "./institutions.controller";
import { InstitutionsService } from "./institutions.service";

@Module({
    providers: [InstitutionsService],
    controllers: [InstitutionsController],
    exports: [InstitutionsService],
})
export class InstitutionsModule { }