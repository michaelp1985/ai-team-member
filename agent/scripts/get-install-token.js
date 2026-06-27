'use strict';

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');

async function main() {
  const appId = parseInt(process.env.GITHUB_APP_ID, 10);
  const privateKey = process.env.GITHUB_PRIVATE_KEY;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;

  if (!appId || !privateKey || !owner || !repo) {
    throw new Error('Missing required env vars: GITHUB_APP_ID, GITHUB_PRIVATE_KEY, REPO_OWNER, REPO_NAME');
  }

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });

  const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner, repo });

  const installationOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: installation.id },
  });

  const { token } = await installationOctokit.auth({ type: 'installation' });

  console.log(token);
}

main().catch(err => {
  process.stderr.write(`get-install-token failed: ${err.message}\n`);
  process.exit(1);
});
