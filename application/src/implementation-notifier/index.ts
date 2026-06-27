import * as github from 'github-client';

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

export async function handler(event: CodeBuildStateChangeEvent): Promise<void> {
  const status = event.detail['build-status'];
  const buildId = event.detail['build-id'];
  const envVars = event.detail['additional-information'].environment['environment-variables'];

  const issueNumber = parseInt(getEnvVar(envVars, 'ISSUE_NUMBER') ?? '', 10);
  const repoOwner = getEnvVar(envVars, 'REPO_OWNER');
  const repoName = getEnvVar(envVars, 'REPO_NAME');

  if (!repoOwner || !repoName || isNaN(issueNumber)) return;

  const region = process.env['AWS_REGION'] ?? 'us-east-2';
  const projectName = event.detail['project-name'];
  const logsUrl = buildConsoleUrl(buildId, projectName, region);

  const body = status === 'STOPPED'
    ? `⚠️ Implementation was stopped before completing. [View build logs](${logsUrl})`
    : `❌ Implementation failed. [View build logs](${logsUrl})`;

  await github.createIssueComment(repoOwner, repoName, issueNumber, body);
}
