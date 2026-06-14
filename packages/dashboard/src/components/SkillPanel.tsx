"use client";

interface Props {
  skillStats: Record<string, number>;
  serverStats: Record<string, number>;
}

const SKILL_CATEGORIES: Record<string, { label: string; color: string }> = {
  file_access: { label: "File Access", color: "#f9e2af" },
  git_workflow: { label: "Git Workflow", color: "#74c7ec" },
  e2e_testing: { label: "E2E Testing", color: "#a6e3a1" },
  research: { label: "Research", color: "#cba6f7" },
  reasoning: { label: "Reasoning", color: "#f5c2e7" },
  database: { label: "Database", color: "#fab387" },
  frontend_design: { label: "Frontend Design", color: "#89b4fa" },
  media_generation: { label: "Media Gen", color: "#94e2d5" },
  project_management: { label: "Project Mgmt", color: "#b4befe" },
  deployment: { label: "Deployment", color: "#f38ba8" },
  memory_retrieval: { label: "Memory", color: "#eba0ac" },
  code_execution: { label: "Code Exec", color: "#a6e3a1" },
  observability: { label: "Observability", color: "#89dceb" },
};

export function SkillPanel({ skillStats, serverStats }: Props) {
  const totalSkills = Object.values(skillStats).reduce((a, b) => a + b, 0);
  const totalServerCalls = Object.values(serverStats).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="panel-header">Inferred Skills & Servers</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Skill breakdown */}
        <div>
          <div style={{ fontSize: 11, color: "var(--overlay1)", marginBottom: 6 }}>
            Skills <span style={{ color: "var(--subtext0)" }}>({totalSkills} inferred)</span>
          </div>

          {Object.keys(skillStats).length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--overlay1)", fontStyle: "italic" }}>
              Waiting for MCP activity...
            </div>
          ) : (
            Object.entries(skillStats)
              .sort(([, a], [, b]) => b - a)
              .map(([skill, count]) => {
                const cat = SKILL_CATEGORIES[skill] || { label: skill, color: "var(--overlay0)" };
                const pct = totalSkills > 0 ? (count / totalSkills) * 100 : 0;
                return (
                  <div key={skill} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ color: cat.color }}>{cat.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--subtext0)" }}>
                        {count}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "var(--surface0)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(pct, 2)}%`,
                          background: cat.color,
                          borderRadius: 2,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })
          )}
        </div>

        {/* Server call count */}
        <div>
          <div style={{ fontSize: 11, color: "var(--overlay1)", marginBottom: 6 }}>
            MCP Servers <span style={{ color: "var(--subtext0)" }}>({totalServerCalls} calls)</span>
          </div>

          {Object.keys(serverStats).length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--overlay1)", fontStyle: "italic" }}>
              No server calls yet
            </div>
          ) : (
            Object.entries(serverStats)
              .sort(([, a], [, b]) => b - a)
              .map(([server, count]) => (
                <div
                  key={server}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 6px",
                    marginBottom: 2,
                    borderRadius: 3,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "var(--text)" }}>
                    {server.replace(/[_-]/g, " ")}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--overlay1)",
                      background: "var(--surface0)",
                      padding: "1px 6px",
                      borderRadius: 3,
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </>
  );
}
