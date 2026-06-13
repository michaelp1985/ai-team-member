import { loadHistory, saveHistory } from './history.js';
import { runConverseLoop } from './loop.js';
import type { WebhookEvent } from './types.js';

export async function handler(event: WebhookEvent): Promise<void> {
  if (event.senderIsBot) return;

  if (event.eventType === 'issue_comment') {
    const slug = process.env['BOT_MENTION_SLUG'] ?? '@sdlc-agent-petty';
    const comment = event.payload['comment'] as Record<string, unknown>;
    if (!(comment['body'] as string).includes(slug)) return;
  }

  const { repo, itemNumber } = event;

  const history = await loadHistory(repo.fullName, itemNumber);
  const updatedMessages = await runConverseLoop(event, history);
  await saveHistory(repo.fullName, itemNumber, updatedMessages);
}
