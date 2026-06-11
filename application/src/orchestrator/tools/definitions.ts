import type { Tool } from '@aws-sdk/client-bedrock-runtime';

export const toolDefinitions: Tool[] = [
  {
    toolSpec: {
      name: 'get_issue',
      description: 'Get a GitHub issue by number.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            issue_number: { type: 'number' },
          },
          required: ['owner', 'repo', 'issue_number'],
        },
      },
    },
  },
  // {
  //   toolSpec: {
  //     name: 'create_issue',
  //     description: 'Create a new GitHub issue.',
  //     inputSchema: {
  //       json: {
  //         type: 'object',
  //         properties: {
  //           owner: { type: 'string' },
  //           repo: { type: 'string' },
  //           title: { type: 'string' },
  //           body: { type: 'string' },
  //           labels: { type: 'array', items: { type: 'string' } },
  //         },
  //         required: ['owner', 'repo', 'title'],
  //       },
  //     },
  //   },
  // },
  // {
  //   toolSpec: {
  //     name: 'update_issue',
  //     description: 'Update an existing GitHub issue.',
  //     inputSchema: {
  //       json: {
  //         type: 'object',
  //         properties: {
  //           owner: { type: 'string' },
  //           repo: { type: 'string' },
  //           issue_number: { type: 'number' },
  //           title: { type: 'string' },
  //           body: { type: 'string' },
  //           state: { type: 'string', enum: ['open', 'closed'] },
  //           labels: { type: 'array', items: { type: 'string' } },
  //           assignees: { type: 'array', items: { type: 'string' } },
  //         },
  //         required: ['owner', 'repo', 'issue_number'],
  //       },
  //     },
  //   },
  // },
  {
    toolSpec: {
      name: 'get_pull_request',
      description: 'Get a GitHub pull request by number.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            pull_number: { type: 'number' },
          },
          required: ['owner', 'repo', 'pull_number'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'list_commits',
      description: 'List commits on a pull request.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            pull_number: { type: 'number' },
          },
          required: ['owner', 'repo', 'pull_number'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_diff',
      description: 'Get the diff for a pull request.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            pull_number: { type: 'number' },
          },
          required: ['owner', 'repo', 'pull_number'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_pr_comments',
      description: 'List review comments on a pull request.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            pull_number: { type: 'number' },
          },
          required: ['owner', 'repo', 'pull_number'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'post_comment',
      description: 'Post a comment on an issue or pull request.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            issue_number: { type: 'number' },
            body: { type: 'string' },
          },
          required: ['owner', 'repo', 'issue_number', 'body'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'request_changes',
      description: 'Submit a pull request review requesting changes.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            pull_number: { type: 'number' },
            body: { type: 'string' },
          },
          required: ['owner', 'repo', 'pull_number', 'body'],
        },
      },
    },
  },
  // {
  //   toolSpec: {
  //     name: 'approve_pr',
  //     description: 'Approve a pull request.',
  //     inputSchema: {
  //       json: {
  //         type: 'object',
  //         properties: {
  //           owner: { type: 'string' },
  //           repo: { type: 'string' },
  //           pull_number: { type: 'number' },
  //         },
  //         required: ['owner', 'repo', 'pull_number'],
  //       },
  //     },
  //   },
  // },
];
