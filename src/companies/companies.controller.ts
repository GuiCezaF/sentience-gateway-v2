import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CompaniesService } from './companies.service.js';
import {
  createCompanySchema,
  type CompanyListItemResponse,
  type CreateCompanyDto,
  type CreatedCompanyResponse,
} from './dto/create-company.dto.js';

@Controller('companies')
@UseGuards(AuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles('super_admin')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createCompanySchema))
  async createCompany(
    @Body() body: CreateCompanyDto,
  ): Promise<CreatedCompanyResponse> {
    return this.companiesService.createCompany(body);
  }

  @Get()
  @Roles('super_admin')
  async listCompanies(): Promise<CompanyListItemResponse[]> {
    return this.companiesService.findAllCompanies();
  }
}
