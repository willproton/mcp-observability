/**
 * Skill Inference Engine
 *
 * Infers which Claude Code skills are being used based on:
 * 1. MCP server name patterns
 * 2. Tool name patterns
 * 3. Payload content analysis
 */

interface SkillRule {
  skill: string;
  category: "frontend" | "backend" | "testing" | "devops" | "research" | "data" | "media" | "workflow";
  serverPatterns: RegExp[];
  toolPatterns: RegExp[];
  payloadPatterns: RegExp[];
}

const SKILL_RULES: SkillRule[] = [
  {
    skill: "file_access",
    category: "workflow",
    serverPatterns: [/filesystem/i],
    toolPatterns: [/read_file|write_file|edit_file|list_directory|search_files|get_file_info/i],
    payloadPatterns: [/\.tsx?$/, /\.jsx?$/, /\.py$/, /\.go$/, /\.rs$/, /\.css$/],
  },
  {
    skill: "git_workflow",
    category: "devops",
    serverPatterns: [/github|git/i],
    toolPatterns: [/create_pr|push_files|create_branch|merge_pr|list_commits/i],
    payloadPatterns: [/branch|commit|pull.request|merge/i],
  },
  {
    skill: "e2e_testing",
    category: "testing",
    serverPatterns: [/playwright|browser|puppeteer/i],
    toolPatterns: [/browser_navigate|browser_click|browser_snapshot|browser_evaluate|browser_type/i],
    payloadPatterns: [/test|spec|e2e/],
  },
  {
    skill: "research",
    category: "research",
    serverPatterns: [/context7|exa.web.search|firecrawl/i],
    toolPatterns: [/search|query|fetch|scrape|resolve/i],
    payloadPatterns: [/docs|documentation|api/],
  },
  {
    skill: "reasoning",
    category: "workflow",
    serverPatterns: [/sequential[_-]?thinking/i],
    toolPatterns: [/sequentialthinking|think|reason/i],
    payloadPatterns: [/thought|reasoning|analysis/],
  },
  {
    skill: "database",
    category: "data",
    serverPatterns: [/supabase|clickhouse|postgres|mysql/i],
    toolPatterns: [/query|insert|update|delete|select|execute/i],
    payloadPatterns: [/sql|table|schema|migration/],
  },
  {
    skill: "frontend_design",
    category: "frontend",
    serverPatterns: [/magic|shadcn|vercel/i],
    toolPatterns: [/add_component|search_components|deploy/i],
    payloadPatterns: [/component|ui|css|style|layout|design/],
  },
  {
    skill: "media_generation",
    category: "media",
    serverPatterns: [/fal[_-]?ai/i],
    toolPatterns: [/generate|create_image|text_to_image/i],
    payloadPatterns: [/image|video|audio|media/],
  },
  {
    skill: "project_management",
    category: "workflow",
    serverPatterns: [/jira|confluence|atlassian/i],
    toolPatterns: [/search_issues|create_issue|update_issue|get_issue|search_pages/i],
    payloadPatterns: [/issue|ticket|epic|sprint|page/],
  },
  {
    skill: "deployment",
    category: "devops",
    serverPatterns: [/vercel|railway|cloudflare/i],
    toolPatterns: [/deploy|build|publish/i],
    payloadPatterns: [/deploy|build|production/],
  },
  {
    skill: "memory_retrieval",
    category: "workflow",
    serverPatterns: [/memory|omega.memory/i],
    toolPatterns: [/read_graph|search_nodes|add_nodes|read_memory/i],
    payloadPatterns: [/memory|context|recall/],
  },
  {
    skill: "code_execution",
    category: "backend",
    serverPatterns: [/devfleet|browser.use/i],
    toolPatterns: [/execute|run|dispatch|agent/i],
    payloadPatterns: [/execute|run|code|script/],
  },
  {
    skill: "observability",
    category: "devops",
    serverPatterns: [/cloudflare.observability/i],
    toolPatterns: [/query_logs|get_metrics/i],
    payloadPatterns: [/log|metric|trace|observability/],
  },
];

/**
 * Infer skills from an MCP event.
 * Returns an array of skill names.
 */
export function inferSkills(
  serverName: string,
  toolName: string | undefined,
  payload: Record<string, unknown>
): string[] {
  const matched: string[] = [];
  const payloadStr = JSON.stringify(payload).toLowerCase();

  for (const rule of SKILL_RULES) {
    let score = 0;

    // Check server name match
    for (const pattern of rule.serverPatterns) {
      if (pattern.test(serverName)) {
        score += 3;
        break;
      }
    }

    // Check tool name match
    if (toolName) {
      for (const pattern of rule.toolPatterns) {
        if (pattern.test(toolName)) {
          score += 2;
          break;
        }
      }
    }

    // Check payload content match
    for (const pattern of rule.payloadPatterns) {
      if (pattern.test(payloadStr)) {
        score += 1;
        break;
      }
    }

    // Require at least server match to infer
    if (score >= 3) {
      matched.push(rule.skill);
    }
  }

  return matched;
}

/**
 * Infer skill category from MCP server name alone.
 */
export function inferCategory(serverName: string): string {
  for (const rule of SKILL_RULES) {
    for (const pattern of rule.serverPatterns) {
      if (pattern.test(serverName)) {
        return rule.category;
      }
    }
  }
  return "workflow";
}
