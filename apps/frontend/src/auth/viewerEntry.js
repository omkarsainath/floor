import { requireSession, mountAccountMenu } from './client.js';
const user = await requireSession();
await import('../main.js');
mountAccountMenu(user);
