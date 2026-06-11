import {
  BedrockRuntimeClient,
  ConverseCommand,
  StopReason,
  type Message,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { toolDefinitions } from './tools/definitions.js';
import { dispatchTool } from './tools/handlers.js';
import { getSystemPrompt } from './prompts.js';
import type { WebhookEvent } from './types.js';

const bedrock = new BedrockRuntimeClient({});
const MAX_ITERATIONS = 10;

function getModelId(): string {
  const id = process.env['BEDROCK_MODEL_ID'];
  if (!id) throw new Error('BEDROCK_MODEL_ID is not set');
  return id;
}

function buildSystemPrompt(event: WebhookEvent): string {
  return getSystemPrompt(event);
}

function buildInitialMessage(event: WebhookEvent): Message {
  return {
    role: 'user',
    content: [
      {
        text: `GitHub event received: ${event.eventType}.${event.action} on ${event.repo.fullName} #${event.itemNumber}\n\nPayload:\n${JSON.stringify(event.payload, null, 2)}`,
      },
    ],
  };
}

export async function runConverseLoop(event: WebhookEvent, history: Message[]): Promise<Message[]> {
  const modelId = getModelId();
  const systemPrompt = buildSystemPrompt(event);
  const messages: Message[] = [
    ...history,
    buildInitialMessage(event),
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await bedrock.send(new ConverseCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages,
      toolConfig: { tools: toolDefinitions },
    }));

    const assistantContent = response.output?.message?.content ?? [];
    messages.push({ role: 'assistant', content: assistantContent });

    if (response.stopReason === StopReason.END_TURN) break;

    if (response.stopReason === StopReason.TOOL_USE) {
      const toolResults: ContentBlock[] = [];

      for (const block of assistantContent) {
        if (!block.toolUse) continue;

        const { toolUseId, name, input } = block.toolUse;
        try {
          const result = await dispatchTool(name!, input as Record<string, unknown>);
          toolResults.push({
            toolResult: {
              toolUseId,
              content: [{ text: JSON.stringify(result) }],
            },
          });
        } catch (err) {
          toolResults.push({
            toolResult: {
              toolUseId,
              status: 'error',
              content: [{ text: (err as Error).message }],
            },
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  return messages;
}
