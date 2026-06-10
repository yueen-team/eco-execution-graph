import process from 'node:process';
import { workflowConfig } from './config.mjs';
import { runPnpm } from './run.mjs';

const commitMessageFile = process.argv[2];

if (!commitMessageFile) {
  console.error('commit-msg hook requires the commit message file path.');
  process.exit(1);
}

runPnpm([...workflowConfig.commitlintCommand, commitMessageFile]);
