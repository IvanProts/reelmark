/** Type-level checks for translations: valid keys and the placeholders each key needs. */
import type { uk } from './uk';

/** Every key that exists in the source dictionary, e.g. `'deck.seen'`. */
export type TranslationKey = keyof typeof uk;

/** What every language file must look like: the same keys as `uk.ts`. */
export type Dictionary = Record<TranslationKey, string>;

/**
 * Placeholder names inside a string: `'Оцінено: {count}'` → `'count'`.
 * A recursive template-literal type: it takes the first `{…}`, then recurses on the rest.
 */
type PlaceholderNames<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNames<Rest>
  : never;

/** The values to fill in for a key; keys without placeholders take none. */
type ParamsFor<Key extends TranslationKey> = [PlaceholderNames<(typeof uk)[Key]>] extends [never]
  ? []
  : [params: Record<PlaceholderNames<(typeof uk)[Key]>, string | number>];

/** Keys whose text has no placeholders — handy when a key is stored in a variable. */
export type PlainTranslationKey = {
  [Key in TranslationKey]: ParamsFor<Key> extends [] ? Key : never;
}[TranslationKey];

/**
 * `t('deck.seen')` or `t('deck.counter', { count: 3 })`. Forgetting a
 * placeholder value — or passing one that doesn't exist — is a compile error.
 */
export type TranslateFn = <Key extends TranslationKey>(
  key: Key,
  ...params: ParamsFor<Key>
) => string;
