// Git workflow 配置。
// 复制到新项目后，优先修改这里，而不是修改每个 hook 脚本。
export const workflowConfig = {
  // 被视为主干的本地分支。
  mainBranches: ['main', 'master'],

  // 永远不能被 main:ship 删除的分支。
  protectedBranches: ['main', 'master', 'develop'],
  protectedBranchPrefixes: ['release/'],

  // 项目验证命令，verifyAll 等价于“可以发出去”的证据；stagedCheck 只处理暂存文件。
  verifyAllCommand: ['verify:all'],
  checkCommand: ['verify:check'],
  stagedCheckCommand: ['verify:check'],
  commitlintCommand: ['exec', 'commitlint', '--edit'],

  // BDD 合同导出命令和产物路径。
  bddExportCommand: ['bdd:export'],
  behaviorContractPath: 'bdd/behavior-contracts.ndjson',

  // AI skills index 自动维护命令。
  skillsIndexCommand: ['skills:index'],
  skillsIndexSensitivePatterns: [
    'SKILL.md',
    'docs/agents/',
    '.claude/settings.json',
    'AGENTS.md',
    'CLAUDE.md',
  ],

  defaultRemote: 'origin',
  worktreeRoot: '.worktrees',

  // Optional guard for projects that use isolated clones/worktrees.
  // When enabled, main:ship fails if a same-origin clone/worktree is dirty,
  // ahead of local main, or already merged but still present.
  isolationGuard: {
    enabled: false,
    strict: true,
    roots: [],
    allowEnv: 'ALLOW_ISOLATED_WORKSPACES',
  },
};
