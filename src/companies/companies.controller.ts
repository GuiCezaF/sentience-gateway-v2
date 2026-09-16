import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/user.decorator.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CompaniesService } from './companies.service.js';
import {
  createCompanySchema,
  type CompanyListItemResponse,
  type CreateCompanyDto,
  type CreatedCompanyResponse,
} from './dto/create-company.dto.js';
import {
  createCompanyUserSchema,
  type CompanyUserListItemResponse,
  type CreateCompanyUserDto,
  type CreatedCompanyUserResponse,
} from './dto/create-company-user.dto.js';

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

  @Post(':companyId/users')
  @Roles('company_admin', 'super_admin')
  @HttpCode(HttpStatus.CREATED)
  async createCompanyUser(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(createCompanyUserSchema))
    body: CreateCompanyUserDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<CreatedCompanyUserResponse> {
    return this.companiesService.createCompanyUser(
      companyId,
      body,
      currentUser,
    );
  }

  @Get(':companyId/users')
  @Roles('company_admin', 'super_admin')
  async listCompanyUsers(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<CompanyUserListItemResponse[]> {
    return this.companiesService.findCompanyUsers(companyId, currentUser);
  }
}
