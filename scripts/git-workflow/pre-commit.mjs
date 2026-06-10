import process from 'node:process';
import { workflowConfig } from './config.mjs';
import { readTextIfExists, runPnpm, stagedFiles } from './run.mjs';

// 提交前先导出 BDD 行为合同，避免 feature 和结构化 NDJSON 断层。
const before = readTextIfExists(workflowConfig.behaviorContractPath);

runPnpm(workflowConfig.bddExportCommand);

const after = readTextIfExists(workflowConfig.behaviorContractPath);

if (before && before !== after) {
  console.error(
    `${workflowConfig.behaviorContractPath} was out of date. Review and stage the regenerated file.`,
  );
  process.exit(1);
}

// 如果提交涉及 skills 或 AI 协议，自动刷新 skills index。
const staged = stagedFiles();
const shouldRefreshSkillsIndex = staged.some((filePath) =>
  workflowConfig.skillsIndexSensitivePatterns.some((pattern) => filePath.includes(pattern)),
);

if (shouldRefreshSkillsIndex) {
  // Refresh docs/agents/skills-index.md via pnpm skills:index when routing inputs change.
  runPnpm(workflowConfig.skillsIndexCommand);
}

runPnpm(workflowConfig.stagedCheckCommand ?? workflowConfig.checkCommand);
