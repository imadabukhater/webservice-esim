import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Patch,
  Delete,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PlanService } from './plan.service';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
import type { Session } from '../common/types/auth';
import {
  CreatePlanRequestDto,
  UpdatePlanRequestDto,
  PlanResponseDto,
  PlanWithProviderResponseDto,
  ResetPlansDto,
  ResetPlansResultDto,
  SyncPlansDto,
  SyncPlansResultDto,
} from './dto/plan.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role';
@ApiTags('Plans')
@ApiBearerAuth('JWT-auth')
@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}
  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all plans' })
  @ApiQuery({
    name: 'is_active',
    required: false,
    description: 'Filter by active status',
    example: 'true',
  })
  @ApiResponse({
    status: 200,
    description: 'List of plans with provider details',
    type: [PlanWithProviderResponseDto],
  })
  async getAllPlans(
    @Query('is_active') is_active?: string,
  ): Promise<PlanWithProviderResponseDto[]> {
    const isActiveFilter =
      is_active === 'true' ? true : is_active === 'false' ? false : undefined;
    return this.planService.findAll(isActiveFilter);
  }
  @Get('manage/all')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'All plans including hidden and archived ones (Admin only)',
  })
  @ApiQuery({ name: 'provider_id', required: false, example: 1 })
  @ApiResponse({ status: 200, type: [PlanWithProviderResponseDto] })
  async getAllPlansForAdmin(
    @Query('provider_id') providerId?: string,
  ): Promise<PlanWithProviderResponseDto[]> {
    const id = providerId !== undefined ? Number(providerId) : undefined;
    if (id !== undefined && !Number.isInteger(id)) {
      throw new BadRequestException('provider_id must be an integer');
    }
    return this.planService.findAllForAdmin(id);
  }

  @Post('sync')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Sync a provider's catalog (Admin only): create / update plans by name, remove the ones not listed. Never duplicates a plan for the same provider.",
  })
  @ApiResponse({ status: 200, type: SyncPlansResultDto })
  async syncPlans(
    @CurrentUser() user: Session,
    @Body() dto: SyncPlansDto,
  ): Promise<SyncPlansResultDto> {
    return this.planService.syncProviderPlans(dto, user.userId);
  }

  @Post('reset')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Delete all plans (Admin only). Plans with orders are archived instead. Requires confirm: "DELETE ALL PLANS".',
  })
  @ApiResponse({ status: 200, type: ResetPlansResultDto })
  async resetPlans(
    @CurrentUser() user: Session,
    @Body() dto: ResetPlansDto,
  ): Promise<ResetPlansResultDto> {
    return this.planService.resetPlans(dto, user.userId);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a plan by ID' })
  @ApiParam({ name: 'id', description: 'Plan ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Plan details with provider information',
    type: PlanWithProviderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async getPlanById(
    @Param('id') id: number,
  ): Promise<PlanWithProviderResponseDto> {
    return this.planService.findOne(id);
  }
  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new plan (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Plan created successfully',
    type: PlanResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createPlan(
    @CurrentUser() user: Session,
    @Body() createPlanDto: CreatePlanRequestDto,
  ): Promise<PlanResponseDto> {
    return this.planService.create(createPlanDto, user.userId);
  }
  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a plan (Admin only)' })
  @ApiParam({ name: 'id', description: 'Plan ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Plan updated successfully',
    type: PlanResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updatePlan(
    @CurrentUser() user: Session,
    @Param('id') id: number,
    @Body() updatePlanDto: UpdatePlanRequestDto,
  ): Promise<PlanResponseDto> {
    return this.planService.update(id, updatePlanDto, user.userId);
  }
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a plan (Admin only)' })
  @ApiParam({ name: 'id', description: 'Plan ID', example: 1 })
  @ApiResponse({ status: 204, description: 'Plan deleted successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async deletePlan(
    @CurrentUser() user: Session,
    @Param('id') id: number,
  ): Promise<void> {
    return this.planService.remove(id, user.userId);
  }
}
