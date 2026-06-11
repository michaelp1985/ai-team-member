import * as github from 'github-client';

type ToolInput = Record<string, unknown>;

export async function dispatchTool(toolName: string, input: ToolInput): Promise<unknown> {
  switch (toolName) {
    case 'get_issue':
      return github.getIssue(
        input['owner'] as string,
        input['repo'] as string,
        input['issue_number'] as number,
      );

    // case 'create_issue':
    //   return github.createIssue(
    //     input['owner'] as string,
    //     input['repo'] as string,
    //     input['title'] as string,
    //     input['body'] as string | undefined,
    //     input['labels'] as string[] | undefined,
    //   );

    // case 'update_issue':
    //   return github.updateIssue(
    //     input['owner'] as string,
    //     input['repo'] as string,
    //     input['issue_number'] as number,
    //     {
    //       title: input['title'] as string | undefined,
    //       body: input['body'] as string | undefined,
    //       state: input['state'] as 'open' | 'closed' | undefined,
    //       labels: input['labels'] as string[] | undefined,
    //       assignees: input['assignees'] as string[] | undefined,
    //     },
    //   );

    case 'get_pull_request':
      return github.getPullRequest(
        input['owner'] as string,
        input['repo'] as string,
        input['pull_number'] as number,
      );

    case 'list_commits':
      return github.listPullRequestCommits(
        input['owner'] as string,
        input['repo'] as string,
        input['pull_number'] as number,
      );

    case 'get_diff':
      return github.getPullRequestDiff(
        input['owner'] as string,
        input['repo'] as string,
        input['pull_number'] as number,
      );

    case 'get_pr_comments':
      return github.listPullRequestComments(
        input['owner'] as string,
        input['repo'] as string,
        input['pull_number'] as number,
      );

    case 'post_comment':
      return github.createIssueComment(
        input['owner'] as string,
        input['repo'] as string,
        input['issue_number'] as number,
        input['body'] as string,
      );

    case 'request_changes':
      return github.requestChanges(
        input['owner'] as string,
        input['repo'] as string,
        input['pull_number'] as number,
        input['body'] as string,
      );

    // case 'approve_pr':
    //   return github.approvePullRequest(
    //     input['owner'] as string,
    //     input['repo'] as string,
    //     input['pull_number'] as number,
    //   );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
