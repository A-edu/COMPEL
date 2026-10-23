import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import { EntitiesService, type EntityOption } from './entities.service.js';

@Controller('entities')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<EntityOption[]> {
    return this.entities.providers(user);
  }
}
