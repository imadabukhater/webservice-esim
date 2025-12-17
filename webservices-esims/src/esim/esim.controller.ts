import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  CreateEsimDto,
  UpdateEsimDto,
  EsimResponseDto,
  EsimWithPlanResponseDto,
} from './dto/esim.dto';
import { EsimService } from './esim.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
import type { Session } from '../common/types/auth';
import { EsimStatus } from '../enums/myenums';
@ApiTags('eSIMs')
@ApiBearerAuth('JWT-auth')
@Controller('esims')
export class EsimController {
  constructor(private readonly esimService: EsimService) {}
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get all eSIMs (Admin only)',
    description: 'Get all eSIMs, optionally filtered by status',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all eSIMs with plan details',
    type: [EsimWithPlanResponseDto],
  })
  async getAllEsims(
    @Query('status') status?: EsimStatus,
  ): Promise<EsimWithPlanResponseDto[]> {
    return this.esimService.getAllEsims(status);
  }
  @Get('my-esims')
  @ApiOperation({ summary: 'Get my assigned eSIMs (Customer only)' })
  @ApiResponse({
    status: 200,
    description: 'List of my assigned eSIMs',
    type: [EsimWithPlanResponseDto],
  })
  async getMyEsims(
    @CurrentUser() user: Session,
  ): Promise<EsimWithPlanResponseDto[]> {
    return this.esimService.getAssignedEsimsByUserId(user.userId);
  }
  @Get(':id')
  @ApiOperation({
    summary: 'Get eSIM by ID',
    description:
      'Admins can view any eSIM. Customers can only view eSIMs they own.',
  })
  @ApiParam({ name: 'id', description: 'eSIM ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'eSIM details with plan information',
    type: EsimWithPlanResponseDto,
  })
  @ApiResponse({ status: 404, description: 'eSIM not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - eSIM does not belong to you',
  })
  async getEsimById(
    @Param('id') id: number,
    @CurrentUser() user: Session | undefined,
  ): Promise<EsimWithPlanResponseDto> {
    const esim = await this.esimService.getEsimById(id);
    // If customer (not admin), check if they own this eSIM
    if (user?.role === Role.CUSTOMER) {
      const userEsims = await this.esimService.getAssignedEsimsByUserId(
        user.userId,
      );
      const owns = userEsims.some((e) => e.esim_id === id);
      if (!owns) {
        throw new ForbiddenException('eSIM does not belong to you');
      }
    }
    return esim;
  }
  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new eSIM (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'eSIM created successfully',
    type: EsimResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createEsim(
    @CurrentUser() user: Session,
    @Body() createEsimDto: CreateEsimDto,
  ): Promise<EsimResponseDto> {
    return this.esimService.createEsim(createEsimDto, user.userId);
  }
  @Put(':id')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Update an eSIM (Admin only)' })
  @ApiParam({ name: 'id', description: 'eSIM ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'eSIM updated successfully',
    type: EsimResponseDto,
  })
  @ApiResponse({ status: 404, description: 'eSIM not found' })
  async updateEsim(
    @CurrentUser() user: Session,
    @Param('id') id: number,
    @Body() updateEsimDto: UpdateEsimDto,
  ): Promise<EsimResponseDto> {
    return this.esimService.updateEsim(id, updateEsimDto, user.userId);
  }
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an eSIM (Admin only)' })
  @ApiParam({ name: 'id', description: 'eSIM ID', example: 1 })
  @ApiResponse({ status: 204, description: 'eSIM deleted successfully' })
  @ApiResponse({ status: 404, description: 'eSIM not found' })
  async deleteEsim(
    @CurrentUser() user: Session,
    @Param('id') id: number,
  ): Promise<void> {
    return this.esimService.deleteEsim(id, user.userId);
  }
}
