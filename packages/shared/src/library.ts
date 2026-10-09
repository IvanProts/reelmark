import { z } from 'zod';

import { DEFAULT_LOCALE, LocaleSchema, MovieCardSchema } from './movies.js';
import { intParam } from './primitives.js';

/** TMDB ids are positive 32-bit integers. */
const MovieIdSchema = intParam(1, 2_147_483_647);

/** How the user sorted a movie: swipe right, left or up. */
export const DecisionStatusSchema = z.enum(['seen', 'not_seen', 'want']);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

/** Route params of `/api/v1/me/decisions/:movieId`. */
export const MovieIdParamsSchema = z.object({
  movieId: MovieIdSchema,
});
export type MovieIdParams = z.infer<typeof MovieIdParamsSchema>;

/** Body of `PUT /api/v1/me/decisions/:movieId`. */
export const SaveDecisionSchema = z
  .object({
    status: DecisionStatusSchema,
    /** Only for "seen": true = liked, false = disliked, null = no opinion given. */
    liked: z.boolean().nullable().default(null),
  })
  .refine((decision) => decision.status === 'seen' || decision.liked === null, {
    path: ['liked'],
    message: 'allowed only when status is "seen"',
  });
export type SaveDecision = z.infer<typeof SaveDecisionSchema>;

/** A saved decision, as returned by the API. */
export const DecisionSchema = z.object({
  movieId: z.number().int().positive(),
  status: DecisionStatusSchema,
  liked: z.boolean().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Decision = z.infer<typeof DecisionSchema>;

/** Library tabs. "not_seen" movies are recommendation candidates, not a library list. */
export const LibraryStatusSchema = z.enum(['seen', 'want']);
export type LibraryStatus = z.infer<typeof LibraryStatusSchema>;

/** Query of `GET /api/v1/me/library`. Newest decisions first. */
export const LibraryQuerySchema = z.object({
  status: LibraryStatusSchema,
  lang: LocaleSchema.default(DEFAULT_LOCALE),
  /** Opaque value from the previous page's `nextCursor`. */
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,200}$/)
    .optional(),
  limit: intParam(1, 60).default(30),
});
export type LibraryQuery = z.infer<typeof LibraryQuerySchema>;

export const LibraryItemSchema = z.object({
  movie: MovieCardSchema,
  decision: DecisionSchema,
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

/** Response of `GET /api/v1/me/library`. `nextCursor` is null on the last page. */
export const LibraryPageSchema = z.object({
  items: z.array(LibraryItemSchema),
  nextCursor: z.string().nullable(),
});
export type LibraryPage = z.infer<typeof LibraryPageSchema>;

/** Response of `GET /api/v1/me` and `PATCH /api/v1/me`. */
export const MeSchema = z.object({
  id: z.uuid(),
  /** The user's chosen language; null until they pick one (the app then follows the device). */
  locale: LocaleSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type Me = z.infer<typeof MeSchema>;

/** Body of `PATCH /api/v1/me`. */
export const UpdateMeSchema = z.object({
  locale: LocaleSchema,
});
export type UpdateMe = z.infer<typeof UpdateMeSchema>;
