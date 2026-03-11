import { registerPlugin } from '@capacitor/core';

import type { PushToTalkPlugin } from './definitions';

const PushToTalk = registerPlugin<PushToTalkPlugin>('PushToTalk');

export * from './definitions';
export { PushToTalk };
