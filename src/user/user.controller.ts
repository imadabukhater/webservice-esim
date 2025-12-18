import {
  Controller,
  Patch,
  Param,
  Body,
  HttpCode,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  ChangePasswordDto,
  UserResponseDto,
  UpdateUserProfileDto,
  RegisterUserDto,
} from './dto/user.dto';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role';
import { Public } from '../auth/decorators/public.decorator';
import { CheckUserAccessGuard } from '../auth/guards/userAccess.guard';
import { type Session } from '../common/types/auth';
import { ParseUserIdPipe } from '../auth/pipes/parseUserId.pipe';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}
  // Central registration endpoint for both customers and admins
  // Role is determined by the 'role' field in RegisterUserDto
  @Post()
  @Public()
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new user (customer or admin)' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
  })
  async registerUser(
    @Body() registerUserDto: RegisterUserDto,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    const { accessToken, user } =
      await this.authService.registerUser(registerUserDto);
    return { accessToken, user };
  }
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: [UserResponseDto],
  })
  async getAllUsers(): Promise<UserResponseDto[]> {
    return this.userService.getAllUsers();
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', example: 1 })
  @UseGuards(CheckUserAccessGuard) // 👈
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(
    @Param('id', ParseUserIdPipe) id: 'me' | number, // 👈
    @CurrentUser() user: Session,
  ): Promise<UserResponseDto> {
    const userId = id === 'me' ? user.userId : id; // 👈
    return await this.userService.getUserById(userId);
  }
  @Patch(':id/profile')
  @UseGuards(CheckUserAccessGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiParam({ name: 'id', description: 'User ID or "me"', example: 'me' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserProfile(
    @Param('id', ParseUserIdPipe) id: 'me' | number,
    @CurrentUser() user: Session,
    @Body() updateUserProfileDto: UpdateUserProfileDto,
  ): Promise<UserResponseDto> {
    const userId = id === 'me' ? user.userId : id;
    return this.userService.updateUserProfile(userId, updateUserProfileDto);
  }
  @Patch(':id/password')
  @UseGuards(CheckUserAccessGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Change user password' })
  @ApiParam({ name: 'id', description: 'User ID or "me"', example: 'me' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password changed successfully' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Old password is incorrect' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async changePassword(
    @Param('id', ParseUserIdPipe) id: 'me' | number,
    @CurrentUser() user: Session,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const userId = id === 'me' ? user.userId : id;
    return this.userService.changePassword(userId, changePasswordDto);
  }
  @Patch(':id/activate')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Activate a user account (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'User activated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'User is already active' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async activateUser(@Param('id') id: number): Promise<UserResponseDto> {
    return this.userService.activateUser(id);
  }
  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a user account (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'User deactivated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'User is already inactive' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deactivateUser(@Param('id') id: number): Promise<UserResponseDto> {
    return this.userService.deactivateUser(id);
  }
}
