import { registerPlugin } from '@capacitor/core';

import type { PushToTalkPlugin } from './definitions';

const PushToTalk = registerPlugin<PushToTalkPlugin>('PushToTalk', {
  web: () => import('./web').then((m) => new m.PushToTalkWeb()),
});

export * from './definitions';
export { PushToTalk };
