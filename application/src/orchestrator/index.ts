import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import * as github from 'github-client';
import { loadHistory, saveHistory } from './history.js';
import { runConverseLoop } from './loop.js';
import type { WebhookEvent } from './types.js';

const codebuild = new CodeBuildClient({});
const ssm = new SSMClient({});

async function getTimeoutMinutes(): Promise<number | undefined> {
  const paramName = process.env['CODEBUILD_TIMEOUT_PARAM'];
  if (!paramName) return undefined;
  const result = await ssm.send(new GetParameterCommand({ Name: paramName }));
  const val = parseInt(result.Parameter?.Value ?? '', 10);
  return isNaN(val) || val <= 0 ? undefined : val;
}

async function triggerImplementation(event: WebhookEvent): Promise<void> {
  const projectName = process.env['CODEBUILD_PROJECT_NAME'];
  if (!projectName) throw new Error('CODEBUILD_PROJECT_NAME is not set');

  const timeoutInMinutesOverride = await getTimeoutMinutes();

  await codebuild.send(new StartBuildCommand({
    projectName,
    timeoutInMinutesOverride,
    environmentVariablesOverride: [
      { name: 'ISSUE_NUMBER', value: String(event.itemNumber), type: 'PLAINTEXT' },
      { name: 'REPO_FULL_NAME', value: event.repo.fullName, type: 'PLAINTEXT' },
      { name: 'REPO_OWNER', value: event.repo.owner, type: 'PLAINTEXT' },
      { name: 'REPO_NAME', value: event.repo.name, type: 'PLAINTEXT' },
    ],
  }));

  await github.createIssueComment(
    event.repo.owner,
    event.repo.name,
    event.itemNumber,
    `🔧 Implementation started for issue #${event.itemNumber}. I'll post a link to the pull request when the work is complete.`,
  );
}

export async function handler(event: WebhookEvent): Promise<void> {
  if (event.senderIsBot) return;

  if (event.eventType === 'issue_comment') {
    const slug = process.env['BOT_MENTION_SLUG'] ?? '@sdlc-agent-petty';
    const comment = event.payload['comment'] as Record<string, unknown>;
    const body = comment['body'] as string;

    if (!body.includes(slug)) return;

    if (body.toLowerCase().includes('implement')) {
      await triggerImplementation(event);
      return;
    }
  }

  const { repo, itemNumber } = event;

  const history = await loadHistory(repo.fullName, itemNumber);
  const updatedMessages = await runConverseLoop(event, history);
  await saveHistory(repo.fullName, itemNumber, updatedMessages);
}
