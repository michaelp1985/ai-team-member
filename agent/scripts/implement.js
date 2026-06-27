'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-pro-v1:0';
const ISSUE_NUMBER = parseInt(process.env.ISSUE_NUMBER, 10);
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;

const bedrock = new BedrockRuntimeClient({});

let _octokit;
async function getOctokit() {
  if (_octokit) return _octokit;
  const appId = parseInt(process.env.GITHUB_APP_ID, 10);
  const privateKey = process.env.GITHUB_PRIVATE_KEY;
  const appOctokit = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });
  const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner: REPO_OWNER, repo: REPO_NAME });
  _octokit = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey, installationId: installation.id } });
  return _octokit;
}

const TOOL_SPECS = [
  {
    toolSpec: {
      name: 'read_file',
      description: 'Read the contents of a file in the repository.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File path relative to repo root' } },
          required: ['path'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'write_file',
      description: 'Write or overwrite a file. Creates parent directories as needed.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to repo root' },
            content: { type: 'string', description: 'Full file content to write' },
          },
          required: ['path', 'content'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'delete_file',
      description: 'Delete a file from the repository.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File path relative to repo root' } },
          required: ['path'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'list_directory',
      description: 'List entries in a directory. Use "." for the repo root.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Directory path relative to repo root' } },
          required: ['path'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'run_shell',
      description: 'Run a shell command in the repo root. Use for tests, builds, linters. Timeout: 2 minutes.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { command: { type: 'string', description: 'Shell command to execute' } },
          required: ['command'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_issue',
      description: 'Fetch the GitHub issue title, body, and labels.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'post_comment',
      description: 'Post a comment on the GitHub issue. Use when the issue is unclear and you cannot proceed.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { body: { type: 'string', description: 'Comment body (markdown)' } },
          required: ['body'],
        },
      },
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case 'read_file': {
      try {
        const content = fs.readFileSync(input.path, 'utf8');
        const MAX = 32_000;
        return content.length > MAX
          ? content.slice(0, MAX) + `\n\n[truncated — ${content.length} chars total]`
          : content;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    case 'write_file': {
      try {
        const dir = path.dirname(input.path);
        if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(input.path, input.content, 'utf8');
        return `Written: ${input.path}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    case 'delete_file': {
      try {
        fs.unlinkSync(input.path);
        return `Deleted: ${input.path}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    case 'list_directory': {
      try {
        const entries = fs.readdirSync(input.path, { withFileTypes: true });
        return entries.map(e => `${e.isDirectory() ? '[dir] ' : '[file]'} ${e.name}`).join('\n');
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    case 'run_shell': {
      try {
        const output = execSync(input.command, {
          encoding: 'utf8',
          timeout: 120_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return output.trim() || '(no output)';
      } catch (err) {
        return `Exit ${err.status ?? 1}\nstdout: ${(err.stdout ?? '').trim()}\nstderr: ${(err.stderr ?? '').trim()}`;
      }
    }

    case 'get_issue': {
      try {
        const octokit = await getOctokit();
        const { data } = await octokit.issues.get({ owner: REPO_OWNER, repo: REPO_NAME, issue_number: ISSUE_NUMBER });
        return [
          `Title: ${data.title}`,
          `State: ${data.state}`,
          `Labels: ${data.labels.map(l => (typeof l === 'string' ? l : l.name)).join(', ') || 'none'}`,
          '',
          data.body || '(no description)',
        ].join('\n');
      } catch (err) {
        return `Error fetching issue: ${err.message}`;
      }
    }

    case 'post_comment': {
      try {
        const octokit = await getOctokit();
        await octokit.issues.createComment({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          issue_number: ISSUE_NUMBER,
          body: input.body,
        });
        return 'Comment posted.';
      } catch (err) {
        return `Error posting comment: ${err.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

function buildSystemPrompt(projectSpec) {
  const specSection = projectSpec
    ? `\n## Project Configuration\n\nThe following was loaded from ${process.env.AGENT_SPEC_PATH || 'AGENT.md'} in this repository. These conventions take precedence over the defaults below. If your implementation changes the project's architecture or conventions, update this file accordingly.\n\n${projectSpec}\n`
    : '';

  return `You are a pragmatic, test-driven, security-conscious, opinionated senior TypeScript engineer working on the repository ${REPO_OWNER}/${REPO_NAME}.
Implement the work described in GitHub issue #${ISSUE_NUMBER}.
${specSection}
The feature branch has already been checked out. Git operations (commit, push, PR creation) are handled externally — write code only.
Your current working directory is the root of the cloned repository.

Workflow:
1. Call get_issue to read the full issue. If it lacks clear acceptance criteria, post a comment with post_comment explaining what is missing and stop.
2. Explore the repo with list_directory and read_file before writing any code. Understand existing conventions, patterns, and where the new work fits.
3. Implement the feature following the standards below.
4. Write tests (BDD: Gherkin feature files + Jest/Cucumber step definitions).
5. Verify tests pass with run_shell. All existing tests must continue to pass.
6. If your change involves an architectural decision with real tradeoffs, create an ADR in docs/adr/ (numbered sequentially). Update docs/c4/ if you add, remove, or rename a container or component.
7. Stop when your work is complete.

Code standards:
- TypeScript strict mode. Cast to \`any\` only when handling raw external payloads.
- Node.js 22, ESM modules. Use .js extensions on all local imports.
- ARM Lambda targets for Lambda functions.
- Well-named identifiers over comments. Comment only when the WHY is non-obvious.
- Validate at system boundaries only. Trust internal types.
- AWS SDK v3 modular clients only.
- Focus strictly on the issue acceptance criteria. Capture any discovered bugs as notes in the PR body for human review.`;
}

async function run() {
  if (isNaN(ISSUE_NUMBER) || !REPO_OWNER || !REPO_NAME) {
    throw new Error('Missing required env vars: ISSUE_NUMBER, REPO_OWNER, REPO_NAME');
  }

  const specPath = process.env.AGENT_SPEC_PATH || 'AGENT.md';
  let projectSpec = null;
  try {
    projectSpec = fs.readFileSync(specPath, 'utf8');
    console.log(`Loaded project spec from ${specPath}`);
  } catch {
    console.log(`No project spec found at ${specPath}, using defaults`);
  }

  const messages = [
    {
      role: 'user',
      content: [{ text: `Please implement issue #${ISSUE_NUMBER} in ${REPO_OWNER}/${REPO_NAME}. Begin by reading the issue with get_issue.` }],
    },
  ];

  async function invokeModel(messages) {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: buildSystemPrompt(projectSpec) }],
      messages,
      toolConfig: { tools: TOOL_SPECS },
      inferenceConfig: { maxTokens: 8192 },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await bedrock.send(command);
      } catch (err) {

        // Model error exceptions can be expected from time to time. we will allow and retry.
        if (err.name === 'ModelErrorException' && attempt < 2) {
          const delay = (attempt + 1) * 2000;
          console.log(`  ModelErrorException (attempt ${attempt + 1}), retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  }

  const MAX_ITERATIONS = 30;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[iteration ${i + 1}]`);

    const response = await invokeModel(messages);

    const assistantContent = response.output.message.content;
    messages.push({ role: 'assistant', content: assistantContent });

    if (response.stopReason === 'end_turn') {
      console.log('Agent finished.');
      return;
    }

    if (response.stopReason === 'tool_use') {
      const toolResults = [];
      for (const block of assistantContent) {
        if (block.toolUse) {
          const { toolUseId, name, input } = block.toolUse;
          console.log(`  tool: ${name}(${JSON.stringify(input).slice(0, 120)})`);
          const result = await executeTool(name, input);
          toolResults.push({
            toolResult: {
              toolUseId,
              content: [{ text: String(result).slice(0, 100_000) }],
            },
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    console.log(`Stop reason: ${response.stopReason}`);
    break;
  }

  throw new Error(`Agent did not complete within ${MAX_ITERATIONS} iterations`);
}

run().catch(err => {
  process.stderr.write(`implement failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
