import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Message } from '@aws-sdk/client-bedrock-runtime';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

export async function loadHistory(repoFullName: string, itemNumber: number): Promise<Message[]> {
  const result = await dynamo.send(new GetCommand({
    TableName: getTableName(),
    Key: buildKey(repoFullName, itemNumber),
  }));

  return (result.Item?.['messages'] as Message[] | undefined) ?? [];
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
