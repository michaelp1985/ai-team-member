import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as github from 'github-client';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface CodeBuildEnvVar {
  name: string;
  value: string;
  type: string;
}

interface CodeBuildStateChangeEvent {
  detail: {
    'build-status': string;
    'build-id': string;
    'project-name': string;
    'additional-information': {
      environment: {
        'environment-variables': CodeBuildEnvVar[];
      };
    };
  };
}

function getEnvVar(vars: CodeBuildEnvVar[], name: string): string | undefined {
  return vars.find(v => v.name === name)?.value;
}

function buildConsoleUrl(buildId: string, projectName: string, region: string): string {
  const encoded = encodeURIComponent(buildId);
  return `https://${region}.console.aws.amazon.com/codesuite/codebuild/projects/${projectName}/build/${encoded}/log`;
}

async function savePrIssueLink(repoFullName: string, issueNumber: number, prNumber: number): Promise<void> {
  const tableName = process.env['TABLE_NAME'];
  if (!tableName) return;

  const now = new Date().toISOString();
  await Promise.all([
    dynamo.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `repo#${repoFullName}`, sk: `link#issue#${issueNumber}`, linkedPrNumber: prNumber, updatedAt: now },
    })),
    dynamo.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `repo#${repoFullName}`, sk: `link#pr#${prNumber}`, linkedIssueNumber: issueNumber, updatedAt: now },
    })),
  ]);
}

export async function handler(event: CodeBuildStateChangeEvent): Promise<void> {
  const status = event.detail['build-status'];
  const buildId = event.detail['build-id'];
  const projectName = event.detail['project-name'];
  const envVars = event.detail['additional-information'].environment['environment-variables'];

  const issueNumber = parseInt(getEnvVar(envVars, 'ISSUE_NUMBER') ?? '', 10);
  const repoOwner = getEnvVar(envVars, 'REPO_OWNER');
  const repoName = getEnvVar(envVars, 'REPO_NAME');

  if (!repoOwner || !repoName || isNaN(issueNumber)) return;

  const region = process.env['AWS_REGION'] ?? 'us-east-2';
  const logsUrl = buildConsoleUrl(buildId, projectName, region);

  let body: string;

  if (status === 'SUCCEEDED') {
    const branch = `feature/issue-${issueNumber}-implementation`;
    const prUrl = await github.getPullRequestByBranch(repoOwner, repoName, branch);

    if (prUrl) {
      const prMatch = prUrl.match(/\/pull\/(\d+)/);
      if (prMatch) {
        const prNumber = parseInt(prMatch[1], 10);
        await savePrIssueLink(`${repoOwner}/${repoName}`, issueNumber, prNumber);
      }
      body = `✅ Implementation complete. Pull request ready for review: ${prUrl}`;
    } else {
      body = `✅ Implementation complete. [View build logs](${logsUrl})`;
    }
  } else if (status === 'STOPPED') {
    body = `⚠️ Implementation was stopped before completing. [View build logs](${logsUrl})`;
  } else {
    body = `❌ Implementation failed. [View build logs](${logsUrl})`;
  }

  await github.createIssueComment(repoOwner, repoName, issueNumber, body);
}
