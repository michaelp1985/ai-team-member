import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { verifySignature } from './hmac.js';
import { isSupportedEvent, normalizePayload } from './normalize.js';

const ssm = new SSMClient({});
const lambdaClient = new LambdaClient({});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const signatureHeader = event.headers['x-hub-signature-256'];
  if (!signatureHeader) return { statusCode: 401 };

  const paramName = process.env['WEBHOOK_SECRET_PARAM'];
  if (!paramName) throw new Error('WEBHOOK_SECRET_PARAM is not set');

  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  if (!Parameter?.Value) throw new Error(`SSM parameter not found: ${paramName}`);

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64')
    : Buffer.from(event.body ?? '', 'utf8');

  if (!verifySignature(Parameter.Value, rawBody, signatureHeader)) {
    return { statusCode: 401 };
  }

  const eventType = event.headers['x-github-event'] ?? '';
  if (!isSupportedEvent(eventType)) {
    return { statusCode: 200 };
  }

  const webhookEvent = normalizePayload(eventType, rawBody);

  const orchestratorName = process.env['ORCHESTRATOR_FUNCTION_NAME'];
  if (!orchestratorName) throw new Error('ORCHESTRATOR_FUNCTION_NAME is not set');

  await lambdaClient.send(new InvokeCommand({
    FunctionName: orchestratorName,
    InvocationType: 'Event',
    Payload: JSON.stringify(webhookEvent),
  }));

  return { statusCode: 200 };
}
