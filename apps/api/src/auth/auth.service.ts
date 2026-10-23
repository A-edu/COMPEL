import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Me {
  user: { id: string; email: string };
  entity: { id: string; name: string; slug: string };
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { entity: true },
    });
    if (!user) throw new UnauthorizedException('Not logged in.');
    return {
      user: { id: user.id, email: user.email },
      entity: {
        id: user.entity.id,
        name: user.entity.name,
        slug: user.entity.slug,
      },
    };
  }
}
