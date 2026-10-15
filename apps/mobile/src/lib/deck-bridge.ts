/**
 * Lets the movie sheet decide on the deck's top card. The deck registers its top card here, and
 * the sheet's buttons then run the deck's own exit animation, save, undo and "Liked it?" prompt.
 */
import type { DecisionStatus } from '@reelmark/shared';

type TopCard = { movieId: number; decide: (status: DecisionStatus) => void };

let topCard: TopCard | null = null;

/** Registers the deck's top card; returns the cleanup that unregisters it. */
export function registerDeckTopCard(card: TopCard): () => void {
  topCard = card;
  return () => {
    if (topCard === card) topCard = null;
  };
}

/** Decides on `movieId` through the deck, if it is the deck's top card right now. */
export function getDeckDecider(movieId: number): TopCard['decide'] | undefined {
  return topCard?.movieId === movieId ? topCard.decide : undefined;
}
