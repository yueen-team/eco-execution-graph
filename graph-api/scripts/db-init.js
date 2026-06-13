import { createReviewStorage, storageConfigFromEnv } from "../src/storage.js";

async function main() {
  const config = storageConfigFromEnv();
  const storage = await createReviewStorage(config);
  try {
    await storage.init();
    console.log(`[graph-api] storage ready: ${storage.driver}`);
  } finally {
    await storage.close?.();
  }
}

main().catch((error) => {
  console.error(`[graph-api] storage init failed: ${error.message}`);
  process.exitCode = 1;
});
