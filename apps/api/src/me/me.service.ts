import { Injectable, UnauthorizedException } from '@nestjs/common';

import { LocaleSchema, type Me, type UpdateMe } from '@reelmark/shared';

import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The caller's own account. */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(); // deleted after AuthGuard checked it
    }
    return toMe(user);
  }

  async update(userId: string, changes: UpdateMe): Promise<Me> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { locale: changes.locale },
    });
    if (count === 0) {
      throw new UnauthorizedException(); // deleted after AuthGuard checked it
    }
    return this.get(userId);
  }

  /** Deletes the account; its tokens and decisions go with it (ON DELETE CASCADE). */
  async delete(userId: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { id: userId } });
  }
}

function toMe(user: User): Me {
  return {
    id: user.id,
    locale: LocaleSchema.safeParse(user.locale).data ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
