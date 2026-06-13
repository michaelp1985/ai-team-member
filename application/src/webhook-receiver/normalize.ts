const WEBHOOK_EVENT_TYPES = [
  'issues',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'issue_comment',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

export interface WebhookEvent {
  eventType: WebhookEventType;
  action: string;
  repo: {
    owner: string;
    name: string;
    fullName: string;
  };
  itemNumber: number;
  sender: string;
  senderIsBot: boolean;
  payload: Record<string, unknown>;
}

export function isSupportedEvent(eventType: string): eventType is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventType);
}

function extractRepo(body: Record<string, unknown>) {
  const r = body['repository'] as Record<string, unknown>;
  const owner = r['owner'] as Record<string, unknown>;
  return {
    owner: owner['login'] as string,
    name: r['name'] as string,
    fullName: r['full_name'] as string,
  };
}

export function normalizePayload(eventType: WebhookEventType, rawBody: Buffer): WebhookEvent {
  const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  const action = body['action'] as string;
  const repo = extractRepo(body);
  const senderObj = body['sender'] as Record<string, unknown>;
  const sender = senderObj['login'] as string;
  const senderIsBot = senderObj['type'] === 'Bot' || sender.endsWith('[bot]');

  switch (eventType) {
    case 'issues': {
      const issue = body['issue'] as Record<string, unknown>;
      return { eventType, action, repo, itemNumber: issue['number'] as number, sender, senderIsBot, payload: issue };
    }
    case 'pull_request': {
      const pr = body['pull_request'] as Record<string, unknown>;
      return { eventType, action, repo, itemNumber: pr['number'] as number, sender, senderIsBot, payload: pr };
    }
    case 'pull_request_review': {
      const pr = body['pull_request'] as Record<string, unknown>;
      return {
        eventType, action, repo, itemNumber: pr['number'] as number, sender, senderIsBot,
        payload: { review: body['review'], pull_request: pr },
      };
    }
    case 'pull_request_review_comment': {
      const pr = body['pull_request'] as Record<string, unknown>;
      return {
        eventType, action, repo, itemNumber: pr['number'] as number, sender, senderIsBot,
        payload: { comment: body['comment'], pull_request: pr },
      };
    }
    case 'issue_comment': {
      const issue = body['issue'] as Record<string, unknown>;
      return {
        eventType, action, repo, itemNumber: issue['number'] as number, sender, senderIsBot,
        payload: { comment: body['comment'], issue },
      };
    }
  }
}
