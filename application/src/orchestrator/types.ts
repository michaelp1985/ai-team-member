export type WebhookEventType =
  | 'issues'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issue_comment';

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
