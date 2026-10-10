import { UnauthorizedException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';
import { MeService } from './me.service.js';

const USER_ID = '6b1f9c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

/** A user table holding `existing` users (all with locale null). */
function service(existing: string[]) {
  const createdAt = new Date('2026-10-09T10:00:00Z');
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          existing.includes(where.id) ? { id: where.id, locale: 'uk', createdAt } : null,
        ),
      ),
      updateMany: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ count: existing.includes(where.id) ? 1 : 0 }),
      ),
    },
  };
  return new MeService(prisma as unknown as PrismaService);
}

describe('MeService', () => {
  it('updates and returns the profile', async () => {
    await expect(service([USER_ID]).update(USER_ID, { locale: 'uk' })).resolves.toEqual({
      id: USER_ID,
      locale: 'uk',
      createdAt: '2026-10-09T10:00:00.000Z',
    });
  });

  // The account can be deleted between AuthGuard's check and the query.
  it.each([
    ['get', (me: MeService) => me.get(USER_ID)],
    ['update', (me: MeService) => me.update(USER_ID, { locale: 'en' })],
  ])('%s answers 401 when the user no longer exists', async (_name, call) => {
    await expect(call(service([]))).rejects.toThrow(UnauthorizedException);
  });
});
