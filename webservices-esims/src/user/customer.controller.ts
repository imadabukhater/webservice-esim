import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AddFavoriteDto, FavoriteResponseDto } from './dto/user.dto';
import { CustomerService } from './customer.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DeleteResponseDto } from '../common/dto/common.dto';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
import type { Session } from '../common/types/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role';
@ApiTags('Favorites')
@Controller('favorites')
@Roles(Role.CUSTOMER)
@ApiBearerAuth('JWT-auth')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}
  @Get()
  @ApiOperation({
    summary: 'Get my favorite plans',
    description: 'Retrieve all plans favorited by the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Favorites retrieved successfully',
    type: [FavoriteResponseDto],
  })
  async getMyFavorites(
    @CurrentUser() user: Session,
  ): Promise<FavoriteResponseDto[]> {
    return this.customerService.getFavoritesByUserId(user.userId);
  }
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Add favorite plan',
    description: 'Add a plan to my favorites',
  })
  @ApiResponse({
    status: 201,
    description: 'Favorite added successfully',
    type: FavoriteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async addFavorite(
    @CurrentUser() user: Session,
    @Body() addFavoriteDto: AddFavoriteDto,
  ): Promise<FavoriteResponseDto> {
    return this.customerService.addFavorite(
      user.userId,
      addFavoriteDto.plan_id,
    );
  }
  @Delete(':planId')
  @ApiOperation({
    summary: 'Remove favorite plan',
    description: 'Remove a plan from my favorites',
  })
  @ApiParam({ name: 'planId', type: Number, description: 'Plan ID' })
  @ApiResponse({
    status: 200,
    description: 'Favorite removed successfully',
    type: DeleteResponseDto,
  })
  async removeFavorite(
    @CurrentUser() user: Session,
    @Param('planId', ParseIntPipe) planId: number,
  ): Promise<DeleteResponseDto> {
    return this.customerService.removeFavorite(user.userId, planId);
  }
}
