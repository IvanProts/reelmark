/**
 * Ukrainian UI copy and the source of truth for translation keys: every other language must
 * have exactly these keys. `{name}` marks a placeholder, filled by `t('key', { name })`.
 */
export const uk = {
  /** The brand name: not translated, but kept here like every visible string. */
  'app.name': 'Reelmark',
  /** This language's name in itself, for the language switch. */
  'language.name': 'Українська',

  'deck.counter': 'Оцінено: {count}',
  'deck.notSeen': 'Не бачив',
  'deck.notSeenHint': 'Позначити, що ви не бачили цей фільм, і показати наступний',
  'deck.seen': 'Бачив',
  'deck.seenHint': 'Позначити, що ви бачили цей фільм, і показати наступний',
  'deck.credit': 'Дані та постери: TMDB',
  'deck.loading': 'Завантажуємо фільми',
  'deck.retry': 'Спробувати ще',
  'deck.emptyTitle': 'Тут поки порожньо',
  'deck.emptyMessage': 'Сервер не знайшов жодного фільму. Спробуйте оновити трохи згодом.',
  'deck.refresh': 'Оновити',
  'deck.finishedTitle': 'Ви переглянули всі фільми',
  'deck.finishedMessage': 'Нові картки з’являться згодом, а поки можна пройтися ще раз.',
  'deck.restart': 'Почати спочатку',

  'card.noOverview': 'Опису цього фільму поки немає.',
  'card.a11yYear': '{year} рік',
  'card.a11yRating': 'рейтинг {rating} з 10',
  'card.showOverview': 'Показати опис фільму',
  'card.hideOverview': 'Сховати опис',

  'error.unreachableTitle': 'Немає зв’язку з сервером',
  'error.unreachableMessage': 'Перевірте підключення до інтернету й спробуйте ще раз.',
  'error.invalidTitle': 'Не вдалося прочитати дані',
  'error.invalidMessage': 'Сервер надіслав несподівану відповідь. Спробуйте ще раз трохи згодом.',
  'error.configTitle': 'Застосунок не налаштовано',
  'error.configMessage': 'Не вказано адресу сервера (EXPO_PUBLIC_API_URL).',
  'error.genericTitle': 'Щось пішло не так',
  'error.genericMessage': 'Сервер зараз не може показати фільми. Спробуйте ще раз за хвилину.',

  'about.title': 'Про застосунок',
  'about.close': 'Закрити',
  'about.description':
    '{appName} — ваша особиста кінобібліотека. Гортайте картки фільмів, позначайте, що вже бачили, — і отримуйте рекомендації, що подивитися далі.',
  'about.languageTitle': 'Мова',
  'about.dataTitle': 'Дані про фільми',
  'about.dataBody': 'Назви, описи, рейтинги й постери надає The Movie Database (TMDB).',
  /** Shown under the official English sentence; empty when not needed. */
  'about.attributionTranslation':
    'Цей продукт використовує TMDB API, але не схвалений і не сертифікований TMDB.',
  'about.tmdbLink': 'themoviedb.org',
  'about.tmdbLinkHint': 'Відкриває сайт TMDB у браузері',
  'about.version': 'Версія {version}',
} as const;
