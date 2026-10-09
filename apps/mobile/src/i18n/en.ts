import type { Dictionary } from './types';

/** English UI copy. `satisfies Dictionary` turns a missing or extra key into a compile error. */
export const en = {
  'app.name': 'Reelmark',
  'language.name': 'English',

  'deck.counter': 'Rated: {count}',
  'deck.notSeen': 'Not seen',
  'deck.notSeenHint': 'Marks this movie as not seen and shows the next one',
  'deck.seen': 'Seen it',
  'deck.seenHint': 'Marks this movie as seen and shows the next one',
  'deck.credit': 'Data and posters: TMDB',
  'deck.loading': 'Loading movies',
  'deck.retry': 'Try again',
  'deck.emptyTitle': 'Nothing here yet',
  'deck.emptyMessage': 'The server didn’t find any movies. Try refreshing a bit later.',
  'deck.refresh': 'Refresh',
  'deck.finishedTitle': 'You’ve seen them all',
  'deck.finishedMessage': 'New cards will appear later. Meanwhile, you can go through them again.',
  'deck.restart': 'Start over',

  'card.noOverview': 'No description for this movie yet.',
  'card.a11yYear': 'released {year}',
  'card.a11yRating': 'rated {rating} out of 10',
  'card.showOverview': 'Shows the movie description',
  'card.hideOverview': 'Hides the description',

  'error.unreachableTitle': 'Can’t reach the server',
  'error.unreachableMessage': 'Check your internet connection and try again.',
  'error.invalidTitle': 'Couldn’t read the data',
  'error.invalidMessage': 'The server sent an unexpected response. Please try again a bit later.',
  'error.configTitle': 'The app isn’t configured',
  'error.configMessage': 'The server address is missing (EXPO_PUBLIC_API_URL).',
  'error.genericTitle': 'Something went wrong',
  'error.genericMessage': 'The server can’t show movies right now. Please try again in a minute.',

  'about.title': 'About',
  'about.close': 'Close',
  'about.description':
    '{appName} is your personal movie library. Swipe through movie cards, mark what you’ve already seen, and get recommendations for what to watch next.',
  'about.languageTitle': 'Language',
  'about.dataTitle': 'Movie data',
  'about.dataBody':
    'Titles, descriptions, ratings and posters are provided by The Movie Database (TMDB).',
  // The official sentence is already English.
  'about.attributionTranslation': '',
  'about.tmdbLink': 'themoviedb.org',
  'about.tmdbLinkHint': 'Opens the TMDB website in a browser',
  'about.version': 'Version {version}',
} satisfies Dictionary;
