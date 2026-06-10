import process from 'node:process';
import { workflowConfig } from './config.mjs';
import { currentBranch, runPnpm } from './run.mjs';

// 普通 push 不允许直接推主干。主干发布走 main:ship。
const branch = currentBranch();
const isMainShipPush = process.env.GIT_WORKFLOW_MAIN_SHIP === '1';
const isMainBranch = workflowConfig.mainBranches.includes(branch);

if (isMainBranch && !isMainShipPush) {
  console.error(`Refusing to push protected branch "${branch}". Use pnpm main:ship after approval.`);
  process.exit(1);
}

if (isMainBranch) {
  process.exit(0);
}

runPnpm(workflowConfig.verifyAllCommand);
