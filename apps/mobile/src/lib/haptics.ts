/** Haptic feedback for swipes. Android uses its haptics engine, which needs no permission. */
import { Platform } from 'react-native';

import * as Haptics from 'expo-haptics';

/** A light tick when a dragged card crosses the decision threshold. */
export function thresholdTick(): void {
  const feedback =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
      : Haptics.selectionAsync();
  // Haptics are a nicety: a device without them must not surface an error.
  feedback.catch(() => undefined);
}

/** Confirms that a decision was made. */
export function decisionMade(): void {
  const feedback =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  feedback.catch(() => undefined);
}
