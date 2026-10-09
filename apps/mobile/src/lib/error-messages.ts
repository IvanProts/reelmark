import type { PlainTranslationKey } from '@/i18n';

import { ApiError } from './api';

type ErrorCopy = {
  /** Translation keys; the screen renders them with `t()`. */
  title: PlainTranslationKey;
  message: PlainTranslationKey;
  /** Which illustration to show: "no connection" or a generic warning. */
  icon: 'offline' | 'warning';
};

/** Maps any error to the user-facing message for it, as translation keys. */
export function describeError(error: unknown): ErrorCopy {
  const kind = error instanceof ApiError ? error.kind : undefined;

  switch (kind) {
    case 'unreachable':
      return {
        icon: 'offline',
        title: 'error.unreachableTitle',
        message: 'error.unreachableMessage',
      };
    case 'invalid-response':
      return { icon: 'warning', title: 'error.invalidTitle', message: 'error.invalidMessage' };
    case 'config':
      return { icon: 'warning', title: 'error.configTitle', message: 'error.configMessage' };
    default:
      // 'server' errors and anything unexpected.
      return { icon: 'warning', title: 'error.genericTitle', message: 'error.genericMessage' };
  }
}
