import { requireSession, mountAccountMenu } from './client.js';
const user = await requireSession();
await import('../builder/editor.js');
mountAccountMenu(user);
