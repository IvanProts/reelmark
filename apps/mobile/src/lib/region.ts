import { getLocales } from 'expo-localization';

import { DEFAULT_REGION, RegionSchema, type Region } from '@reelmark/shared';

/**
 * The device's country (e.g. "UA"), which decides streaming offers and age ratings. Devices can
 * report no region or a numeric one ("419" for Latin America), so it is validated like any input.
 */
export function getDeviceRegion(): Region {
  const result = RegionSchema.safeParse(getLocales()[0]?.regionCode?.toUpperCase());
  return result.success ? result.data : DEFAULT_REGION;
}
