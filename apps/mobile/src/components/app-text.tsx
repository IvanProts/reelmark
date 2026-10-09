import { Text, type TextProps } from 'react-native';

import { colors, maxFontScale, typography, type ColorToken, type TypographyVariant } from '@/theme';

type AppTextProps = TextProps & {
  /** Which style from the type scale to use. */
  variant?: TypographyVariant;
  /** Which color token to use. */
  color?: ColorToken;
};

/**
 * Text with the design system's type scale and colours; use it instead of `Text`.
 * Font scaling follows the user's text-size setting, capped per variant.
 */
export function AppText({ variant = 'body', color = 'textPrimary', style, ...rest }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontScale[variant]}
      {...rest}
      style={[typography[variant], { color: colors[color] }, style]}
    />
  );
}
