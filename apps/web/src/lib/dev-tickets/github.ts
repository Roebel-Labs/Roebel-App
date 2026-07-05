// Minimal GitHub REST client for the dev-ticket fix pipeline. Plain fetch,
// no octokit. Auth: fine-grained PAT in GITHUB_TICKETS_TOKEN (Vercel env).
import "server-only";

const GH = "https://api.github.com";

export function repoSlug(): string {
  return process.env.GITHUB_TICKETS_REPO || "Roebel-Labs/Roebel-App";
}

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TICKETS_TOKEN;
  if (!token) {
    throw new Error(
      "GitHub-Token fehlt — GITHUB_TICKETS_TOKEN in Vercel setzen"
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: { ...ghHeaders(), ...(init?.headers as Record<string, string>) },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `GitHub ${res.status}: ${(json as { message?: string }).message || res.statusText}`
    );
  }
  return json as T;
}

/** ticket/<uuid-prefix>-<german-safe-slug> */
export function buildBranchName(ticketId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `ticket/${ticketId.slice(0, 8)}-${slug || "fix"}`;
}

export async function dispatchTicketFix(input: {
  ticketId: string;
  title: string;
  branch: string;
  instructions: string;
}): Promise<void> {
  await gh<void>(
    `/repos/${repoSlug()}/actions/workflows/ticket-fix.yml/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: "main",
        inputs: {
          ticket_id: input.ticketId,
          title: input.title.slice(0, 100),
          branch: input.branch,
          instructions: input.instructions.slice(0, 20000),
        },
      }),
    }
  );
}

export interface PrInfo {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged: boolean;
  mergeable_state: string;
  head_sha: string;
}

export async function findPrForBranch(branch: string): Promise<PrInfo | null> {
  const owner = repoSlug().split("/")[0];
  const list = await gh<Array<{ number: number }>>(
    `/repos/${repoSlug()}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=all&per_page=1`
  );
  if (!list.length) return null;
  // The list endpoint omits mergeable_state — fetch the PR detail.
  const pr = await gh<{
    number: number;
    html_url: string;
    state: "open" | "closed";
    merged: boolean;
    mergeable_state: string | null;
    head: { sha: string };
  }>(`/repos/${repoSlug()}/pulls/${list[0].number}`);
  return {
    number: pr.number,
    html_url: pr.html_url,
    state: pr.state,
    merged: pr.merged,
    mergeable_state: pr.mergeable_state ?? "unknown",
    head_sha: pr.head.sha,
  };
}

export type CiStatus = "success" | "failure" | "pending" | "none";

export async function getCiStatus(sha: string): Promise<CiStatus> {
  const res = await gh<{
    total_count: number;
    check_runs: Array<{ status: string; conclusion: string | null }>;
  }>(`/repos/${repoSlug()}/commits/${sha}/check-runs?per_page=100`);
  if (!res.total_count) return "none";
  const bad = ["failure", "timed_out", "cancelled", "action_required"];
  if (res.check_runs.some((c) => bad.includes(c.conclusion ?? ""))) {
    return "failure";
  }
  if (
    res.check_runs.every(
      (c) =>
        c.status === "completed" &&
        ["success", "neutral", "skipped"].includes(c.conclusion ?? "")
    )
  ) {
    return "success";
  }
  return "pending";
}

/**
 * Finds the latest ticket-fix.yml run for a ticket. The workflow's run-name
 * embeds the ticket UUID, so we match on display title.
 */
export async function findTicketWorkflowRun(
  ticketId: string
): Promise<"queued" | "in_progress" | "success" | "failure" | null> {
  const res = await gh<{
    workflow_runs: Array<{
      display_title: string;
      status: string;
      conclusion: string | null;
    }>;
  }>(
    `/repos/${repoSlug()}/actions/workflows/ticket-fix.yml/runs?event=workflow_dispatch&per_page=30`
  );
  const run = res.workflow_runs.find((r) =>
    (r.display_title || "").includes(ticketId)
  );
  if (!run) return null;
  if (run.status === "completed") {
    return run.conclusion === "success" ? "success" : "failure";
  }
  return run.status === "in_progress" ? "in_progress" : "queued";
}

export async function mergePr(prNumber: number, headSha: string): Promise<void> {
  await gh<{ merged: boolean }>(
    `/repos/${repoSlug()}/pulls/${prNumber}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash", sha: headSha }),
    }
  );
}
