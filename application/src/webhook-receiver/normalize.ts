export type WebhookEventType =
  | 'issues'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment';

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
  payload: Record<string, unknown>;
}

const SUPPORTED_EVENTS = new Set<string>([
  'issues',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
]);

export function isSupportedEvent(eventType: string): eventType is WebhookEventType {
  return SUPPORTED_EVENTS.has(eventType);
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

function extractSender(body: Record<string, unknown>): string {
  return (body['sender'] as Record<string, unknown>)['login'] as string;
}

export function normalizePayload(eventType: WebhookEventType, rawBody: Buffer): WebhookEvent {
  const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  const action = body['action'] as string;
  const repo = extractRepo(body);
  const sender = extractSender(body);

  switch (eventType) {
    case 'issues': {
      const issue = body['issue'] as Record<string, unknown>;
      return { eventType, action, repo, itemNumber: issue['number'] as number, sender, payload: issue };
    }
    case 'pull_request': {
      const pr = body['pull_request'] as Record<string, unknown>;
      return { eventType, action, repo, itemNumber: pr['number'] as number, sender, payload: pr };
    }
    case 'pull_request_review': {
      const pr = body['pull_request'] as Record<string, unknown>;
      return {
        eventType, action, repo, itemNumber: pr['number'] as number, sender,
        payload: { review: body['review'], pull_request: pr },
      };
    }
    case 'pull_request_review_comment': {
      const pr = body['pull_request'] as Record<string, unknown>;
      return {
        eventType, action, repo, itemNumber: pr['number'] as number, sender,
        payload: { comment: body['comment'], pull_request: pr },
      };
    }
  }
}
