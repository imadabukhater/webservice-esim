import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { ProviderService } from './provider.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
import type { Session } from '../common/types/auth';
import { ApiBearerAuth } from '@nestjs/swagger';
@Controller('providers')
@ApiBearerAuth('JWT-auth')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}
  @Get()
  @Public()
  async getAllProviders() {
    return this.providerService.getAllProviders();
  }
  @Get(':id')
  @Public()
  async getProviderById(@Param('id', ParseIntPipe) id: number) {
    return this.providerService.getProviderById(id);
  }
  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createProvider(
    @CurrentUser() user: Session,
    @Body() createProviderDto: CreateProviderDto,
  ) {
    return this.providerService.createProvider(createProviderDto, user.userId);
  }
  @Put(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateProvider(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProviderDto: UpdateProviderDto,
  ) {
    return this.providerService.updateProvider(
      id,
      updateProviderDto,
      user.userId,
    );
  }
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProvider(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.providerService.deleteProvider(id, user.userId);
  }
  @Get(':id/plans')
  @Public()
  async getProviderPlans(@Param('id', ParseIntPipe) id: number) {
    return this.providerService.getProviderPlans(id);
  }
  @Get(':id/esims')
  @Roles(Role.ADMIN)
  async getProviderEsims(@Param('id', ParseIntPipe) id: number) {
    return this.providerService.getProviderEsims(id);
  }
}