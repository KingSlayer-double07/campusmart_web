import { Controller, Get, Param, UseGuards, Body, Post, ParseUUIDPipe } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CreateInstitutionDto } from "./dto/create-institution.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import { InstitutionsService } from "./institutions.service";


@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
    constructor(
        private readonly institutionsService: InstitutionsService,
    ) {}
    @ApiOperation({
        summary: 'Get all institutions',
        description: 'Returns a list of all institutions in the system',
    })
    @Get()
    async getAllInstitutions() {
        return await this.institutionsService.getAllInstitutions();
    }

    @ApiOperation({
        summary: 'Get institution by ID',
        description: 'Returns the institution with the specified ID',
    })
    @Get(':id')
    async getInstitutionById(@Param('id', new ParseUUIDPipe()) id: string) {
        return await this.institutionsService.getInstitutionById(id);
    }

    @ApiOperation({
        summary: 'Create a new institution',
        description: 'Allows admin to create a new institution in the system',
    })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Post()
    async createInstitution(@Body() dto: CreateInstitutionDto) {
        const institution = await this.institutionsService.createInstitution(dto);
        return institution;
    }
}