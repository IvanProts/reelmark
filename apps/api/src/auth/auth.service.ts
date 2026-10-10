import { randomUUID } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import type { AuthTokens } from '@reelmark/shared';

import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  TokenService,
} from './token.service.js';

type RefreshOutcome =
  | { kind: 'issued'; tokens: AuthTokens }
  | { kind: 'invalid' }
  | { kind: 'reuse'; familyId: string };

/**
 * Anonymous sign-in and refresh-token rotation.
 *
 * Every sign-in starts a token family. Redeeming a token T revokes it and issues its successor S
 * in the same family.
 *
 * The rotation is only committed once S is used ("deferred rotation commit"): until then, T stays
 * redeemable, because the response carrying S may never have reached the device (app killed,
 * network lost), and the device would present T again. Redeeming T then revokes S and issues a new
 * successor. Losing a response must not lose an anonymous account, whose library exists nowhere
 * else.
 *
 * Once S (or any later token) has been used, presenting T again means someone else holds a copy:
 * the whole family is revoked, and every device using it has to sign in again.
 *
 * Refreshes of one account run one at a time (a row lock on the user), so concurrent requests
 * can't conflict or fork the family: each waits and then sees the previous one's result. When two
 * requests present the same T, the later one supersedes the successor issued to the earlier one;
 * only a second holder of T can end up with that superseded token, so presenting it later counts
 * as reuse. The app never sends concurrent refreshes.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Creates an anonymous account and its first session. */
  signInAnonymously(): Promise<AuthTokens> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: {}, select: { id: true } });
      const { tokens } = await this.issueTokens(tx, user.id, randomUUID());
      return tokens;
    });
  }

  /** Exchanges a refresh token for a new token pair. Fails with 401 for any unusable token. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashRefreshToken(refreshToken);
    const outcome = await this.prisma.$transaction((tx) => this.redeem(tx, tokenHash));
    if (outcome.kind === 'reuse') {
      await this.revokeFamily(outcome.familyId);
    }
    if (outcome.kind !== 'issued') {
      throw new UnauthorizedException();
    }
    return outcome.tokens;
  }

  private async redeem(tx: Prisma.TransactionClient, tokenHash: string): Promise<RefreshOutcome> {
    const owner = await tx.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    if (!owner) {
      return { kind: 'invalid' };
    }
    // Waits for any other refresh of this account to commit. Each statement in a read-committed
    // transaction sees the latest committed data, so the token is read again after the lock.
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${owner.userId}::uuid FOR UPDATE`;

    const now = new Date();
    const stored = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { replacedBy: true },
    });
    if (!stored || stored.expiresAt <= now) {
      return { kind: 'invalid' };
    }

    if (stored.revokedAt) {
      const successor = stored.replacedBy;
      if (!successor || successor.revokedAt) {
        // The successor was used (or the family revoked): this is a replayed copy.
        return { kind: 'reuse', familyId: stored.familyId };
      }
      // The successor was never used, so the device most likely never received it.
      await tx.refreshToken.update({ where: { id: successor.id }, data: { revokedAt: now } });
    }

    // Expired tokens are useless even for reuse detection.
    await tx.refreshToken.deleteMany({ where: { userId: stored.userId, expiresAt: { lt: now } } });
    const { id, tokens } = await this.issueTokens(tx, stored.userId, stored.familyId);
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: stored.revokedAt ?? now, replacedById: id },
    });
    return { kind: 'issued', tokens };
  }

  private async issueTokens(
    tx: Prisma.TransactionClient,
    userId: string,
    familyId: string,
  ): Promise<{ id: string; tokens: AuthTokens }> {
    const refreshToken = createRefreshToken();
    const { id } = await tx.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
      select: { id: true },
    });
    return {
      id,
      tokens: {
        accessToken: await this.tokens.signAccessToken(userId),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken,
      },
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.warn(`Revoked refresh token family ${familyId}: a used refresh token was replayed`);
  }
}
