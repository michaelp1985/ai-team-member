import { loadHistory, saveHistory } from './history.js';
import { runConverseLoop } from './loop.js';
import type { WebhookEvent } from './types.js';

export async function handler(event: WebhookEvent): Promise<void> {
  const { repo, itemNumber } = event;

  const history = await loadHistory(repo.fullName, itemNumber);
  const updatedMessages = await runConverseLoop(event, history);
  await saveHistory(repo.fullName, itemNumber, updatedMessages);
}
