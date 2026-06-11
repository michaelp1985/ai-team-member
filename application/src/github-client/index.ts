import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

const ssm = new SSMClient({});

interface AppCredentials {
  appId: number;
  privateKey: string;
}

let appCredentials: AppCredentials | undefined;
let installationOctokit: Octokit | undefined;

async function getAppCredentials(): Promise<AppCredentials> {
  if (appCredentials) return appCredentials;

  const appIdParam = process.env['GITHUB_APP_ID_PARAM'];
  const privateKeyParam = process.env['GITHUB_PRIVATE_KEY_PARAM'];
  if (!appIdParam || !privateKeyParam) throw new Error('GitHub app SSM params not configured');

  const [appIdResult, privateKeyResult] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: appIdParam, WithDecryption: true })),
    ssm.send(new GetParameterCommand({ Name: privateKeyParam, WithDecryption: true })),
  ]);

  appCredentials = {
    appId: parseInt(appIdResult.Parameter!.Value!, 10),
    privateKey: privateKeyResult.Parameter!.Value!,
  };
  return appCredentials;
}

async function getClient(owner: string, repo: string): Promise<Octokit> {
  if (installationOctokit) return installationOctokit;

  const { appId, privateKey } = await getAppCredentials();

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });

  const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner, repo });

  installationOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: installation.id },
  });

  return installationOctokit;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if ((status === 429 || status === 403) && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

export async function getIssue(owner: string, repo: string, issueNumber: number) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.issues.get({ owner, repo, issue_number: issueNumber }).then(r => r.data)
  );
}

export async function createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.issues.create({ owner, repo, title, body, labels }).then(r => r.data)
  );
}

export async function updateIssue(owner: string, repo: string, issueNumber: number, fields: { title?: string; body?: string; state?: 'open' | 'closed'; labels?: string[]; assignees?: string[] }) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.issues.update({ owner, repo, issue_number: issueNumber, ...fields }).then(r => r.data)
  );
}

export async function getPullRequest(owner: string, repo: string, pullNumber: number) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.pulls.get({ owner, repo, pull_number: pullNumber }).then(r => r.data)
  );
}

export async function listPullRequestCommits(owner: string, repo: string, pullNumber: number) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.paginate(client.pulls.listCommits, { owner, repo, pull_number: pullNumber })
  );
}

export async function getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(async () => {
    const { data } = await client.pulls.get({
      owner, repo, pull_number: pullNumber,
      mediaType: { format: 'diff' },
    });
    return data as unknown as string;
  });
}

export async function listPullRequestComments(owner: string, repo: string, pullNumber: number) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.paginate(client.pulls.listReviewComments, { owner, repo, pull_number: pullNumber })
  );
}

export async function createIssueComment(owner: string, repo: string, issueNumber: number, body: string) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.issues.createComment({ owner, repo, issue_number: issueNumber, body }).then(r => r.data)
  );
}

export async function requestChanges(owner: string, repo: string, pullNumber: number, body: string) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.pulls.createReview({ owner, repo, pull_number: pullNumber, event: 'REQUEST_CHANGES', body }).then(r => r.data)
  );
}

export async function approvePullRequest(owner: string, repo: string, pullNumber: number) {
  const client = await getClient(owner, repo);
  return withRateLimitRetry(() =>
    client.pulls.createReview({ owner, repo, pull_number: pullNumber, event: 'APPROVE' }).then(r => r.data)
  );
}
