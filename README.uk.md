<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo.svg">
    <img alt="Reelmark" src="docs/assets/logo-dark-text.svg" width="300">
  </picture>
</p>

<p align="center">
  <b>Гортай фільми. Пам'ятай, що вже бачив. Знаходь, що подивитися далі.</b>
</p>

<p align="center"><a href="README.md">English version</a></p>

---

Reelmark — мобільна кінобібліотека, яку ти збираєш свайпами. Кіномани, що переглянули сотні
фільмів, губляться в тому, що вже бачили, а знайти щось нове стає дедалі важче. Reelmark показує
по одному фільму: познач, чи бачив його, — і застосунок збирає твою бібліотеку, а далі —
рекомендації на її основі.

<p align="center">
  <img src="docs/screenshots/deck-uk.png" width="200" alt="Колода карток">
  <img src="docs/screenshots/overview-uk.png" width="200" alt="Опис фільму">
  <img src="docs/screenshots/about-uk.png" width="200" alt="Про застосунок і вибір мови">
  <img src="docs/screenshots/deck-en.png" width="200" alt="Колода англійською">
</p>

## Можливості

- **Колода карток** популярних фільмів: постер, рік, рейтинг, жанри, опис
- **Українська та англійська** — і інтерфейс, і дані про фільми; мова береться з налаштувань
  телефона й перемикається в застосунку; якщо перекладу опису немає — показується англійський
- **Швидко й надійно**: наступна сторінка підвантажується заздалегідь; зрозумілі стани помилок
  з повтором
- **Доступність**: контраст WCAG AA, підписи для VoiceOver/TalkBack, великий шрифт, зменшений рух
- **Безпека за задумом**: у застосунку немає жодних секретів — див. [Безпека](#безпека)

**Статус:** рання розробка. Фундамент (етап 0) готовий; далі — свайпи жестами, акаунти й збереження
бібліотеки (етап 1), див. [беклог](docs/BACKLOG.md).

## Архітектура

```mermaid
flowchart LR
    App["Мобільний застосунок<br/>Expo · React Native"] -- "HTTPS · /api/v1" --> API["API<br/>NestJS"]
    API -- "Bearer-токен (лише на сервері)" --> TMDB[("TMDB API")]
    App -. "постери" .-> CDN[("image.tmdb.org")]
    Shared["@reelmark/shared<br/>zod-контракт"] -.- App
    Shared -.- API
```

- **API — межа довіри**: лише він знає токен TMDB і лише він звертається до TMDB. Кожен ендпоінт
  відповідає фіксованому запиту — жодного «універсального проксі».
- **Спільний контракт**: API перевіряє запити, а застосунок — відповіді за тими самими zod-схемами,
  тож вони не можуть непомітно розійтися.
- **Дані TMDB — недовірені**: розмір обмежений, структура перевіряється, дані перетворюються на наші
  власні типи; результати кешуються.

Детально: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (англ.). Як читати код:
[docs/CODE_TOUR.uk.md](docs/CODE_TOUR.uk.md).

## Безпека

- **Жодних секретів на пристрої.** У застосунку є лише адреса API; токен TMDB не залишає сервер і
  передається тільки в заголовку — ніколи в URL чи логах.
- **Захищений API.** Безпекові заголовки (helmet), обмеження частоти запитів, сувора валідація
  вхідних даних, однакові відповіді на помилки без внутрішніх деталей, перевірка конфігурації при
  старті.
- **Обережна робота з TMDB.** Тайм-аути, ліміт розміру відповіді, заборона редиректів, перевірка
  кожного фільму окремо.
- **Секрети не потрапляють у git.** `.gitignore`, хук перед комітом (блокує env-файли, сканує зміни
  [gitleaks](https://github.com/gitleaks/gitleaks)) і сканування всієї історії в CI.
- **Ланцюжок постачання.** pnpm блокує install-скрипти залежностей, не ставить релізи, молодші за
  24 год, і зупиняється на підозрілих змінах у публікації пакетів; CI перевіряє залежності на
  вразливості; GitHub Actions закріплені за конкретними комітами.

## Запуск

Потрібно: Node.js 24, pnpm (`corepack enable pnpm`), gitleaks (`brew install gitleaks`), Xcode
та/або Android Studio, безкоштовний токен TMDB (**API Read Access Token**,
[Settings → API](https://www.themoviedb.org/settings/api)).

```sh
pnpm install
cp apps/api/.env.example apps/api/.env        # вписати TMDB_ACCESS_TOKEN
cp apps/mobile/.env.example apps/mobile/.env  # адреса API для симулятора/емулятора/телефона
pnpm dev:api      # API на http://127.0.0.1:3000/api/v1
pnpm dev:mobile   # Expo — i для iOS, a для Android
```

`pnpm check` — усе, що запускає CI: форматування, лінтер, типи, юніт- та e2e-тести.

## Атрибуція

This product uses the TMDB API but is not endorsed or certified by TMDB. Дані про фільми та
зображення надає [The Movie Database (TMDB)](https://www.themoviedb.org).

## Автор

**Ivan Prots** — [github.com/IvanProts](https://github.com/IvanProts)

## Ліцензія

Copyright © 2026 Ivan Prots. Усі права захищено. Код опубліковано лише для перегляду й оцінки —
див. [LICENSE](LICENSE).
