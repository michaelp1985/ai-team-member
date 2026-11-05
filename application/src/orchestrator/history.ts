import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Message } from '@aws-sdk/client-bedrock-runtime';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type ItemType = 'issue' | 'pr';

function getTableName(): string {
  const name = process.env['TABLE_NAME'];
  if (!name) throw new Error('TABLE_NAME is not set');
  return name;
}

function buildKey(repoFullName: string, itemNumber: number) {
  return {
    pk: `repo#${repoFullName}`,
    sk: `item#${itemNumber}`,
  };
}

function buildLinkKey(repoFullName: string, itemType: ItemType, itemNumber: number) {
  return {
    pk: `repo#${repoFullName}`,
    sk: `link#${itemType}#${itemNumber}`,
  };
}

export async function loadHistory(repoFullName: string, itemNumber: number, itemType: ItemType = 'issue'): Promise<Message[]> {
  const table = getTableName();

  const [primaryResult, linkResult] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: table, Key: buildKey(repoFullName, itemNumber) })),
    dynamo.send(new GetCommand({ TableName: table, Key: buildLinkKey(repoFullName, itemType, itemNumber) })),
  ]);

  const primaryHistory = (primaryResult.Item?.['messages'] as Message[] | undefined) ?? [];

  const linkedNumber = itemType === 'pr'
    ? (linkResult.Item?.['linkedIssueNumber'] as number | undefined)
    : (linkResult.Item?.['linkedPrNumber'] as number | undefined);

  if (!linkedNumber) return primaryHistory;

  const linkedResult = await dynamo.send(new GetCommand({ TableName: table, Key: buildKey(repoFullName, linkedNumber) }));
  const linkedHistory = (linkedResult.Item?.['messages'] as Message[] | undefined) ?? [];

  // Issue history always first so the model sees original requirements before implementation discussion
  return itemType === 'pr'
    ? [...linkedHistory, ...primaryHistory]
    : [...primaryHistory, ...linkedHistory];
}

export async function saveHistory(repoFullName: string, itemNumber: number, messages: Message[]): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      ...buildKey(repoFullName, itemNumber),
      messages,
      updatedAt: new Date().toISOString(),
    },
  }));
}
