import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminActionResponseDto } from './dto/user.dto';
import { AdminActionCategory } from '../enums/myenums';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role';
@ApiTags('Admin Actions')
@Controller('admin-actions')
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}
  @Get()
  @ApiOperation({
    summary: 'Get all admin actions',
    description: 'Retrieve all admin actions with optional category filter',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: Object.values(AdminActionCategory),
    description: 'Filter by action category',
  })
  @ApiQuery({
    name: 'admin_id',
    required: false,
    type: Number,
    description: 'Filter by admin ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin actions retrieved successfully',
    type: [AdminActionResponseDto],
  })
  async getAllActions(
    @Query('category') category?: AdminActionCategory,
    @Query('admin_id') adminId?: number,
  ): Promise<AdminActionResponseDto[]> {
    return this.adminService.getActions(category, adminId);
  }
  @Get(':id')
  @ApiOperation({
    summary: 'Get admin action by ID',
    description: 'Retrieve specific admin action details',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Action ID' })
  @ApiResponse({
    status: 200,
    description: 'Admin action retrieved successfully',
    type: AdminActionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Action not found' })
  async getActionById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminActionResponseDto> {
    return this.adminService.getActionById(id);
  }
}
