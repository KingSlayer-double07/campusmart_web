import { Logger, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInstitutionDto } from "./dto/create-institution.dto";

@Injectable()
export class InstitutionsService {
    constructor(private readonly prisma: PrismaService) { }
    private readonly logger = new Logger(InstitutionsService.name);

    async getAllInstitutions() {
        const institutions = await this.prisma.institution.findMany();
        if (!institutions) {
            return [];
        }
        return institutions;
    }

    async getInstitutionById(id: string) {
        const institution = await this.prisma.institution.findUnique({
            where: { id },
        });
        if (!institution) {
            throw new NotFoundException(`Institution with ID ${id} not found`);
        }
        return institution;
    }

    async createInstitution(dto: CreateInstitutionDto) {
        const institution = await this.prisma.institution.create({
            data: {
                name: dto.name,
                domain: dto.domain,
            },
        });
        return institution;
    }
}