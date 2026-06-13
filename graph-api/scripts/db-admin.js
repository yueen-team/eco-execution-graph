import { createReviewStorage, storageConfigFromEnv } from "../src/storage.js";

function usage() {
  console.log(`Usage:
  node scripts/db-admin.js init
  node scripts/db-admin.js status
  node scripts/db-admin.js list
  node scripts/db-admin.js delete <审核编号>
  node scripts/db-admin.js clear
`);
}

async function main() {
  const command = process.argv[2] || "status";
  const reviewId = process.argv[3];
  const storage = await createReviewStorage(storageConfigFromEnv());
  try {
    await storage.init();
    if (command === "init") {
      console.log(JSON.stringify({ status: "pass", driver: storage.driver }, null, 2));
      return;
    }
    if (command === "status") {
      const rows = await storage.readAll();
      console.log(JSON.stringify({ status: "pass", driver: storage.driver, count: rows.length }, null, 2));
      return;
    }
    if (command === "list") {
      const rows = await storage.readAll();
      console.log(JSON.stringify(rows.map((row) => ({
        "审核编号": row["审核编号"],
        "事件编号": row["事件编号"],
        "当前审核状态": row["当前审核状态"],
        "是否允许进入聚合": row["是否允许进入聚合"],
      })), null, 2));
      return;
    }
    if (command === "delete") {
      if (!reviewId) throw new Error("delete 需要审核编号");
      const deleted = await storage.delete(reviewId);
      console.log(JSON.stringify({ status: "pass", deleted }, null, 2));
      return;
    }
    if (command === "clear") {
      await storage.writeAll([]);
      console.log(JSON.stringify({ status: "pass", cleared: true }, null, 2));
      return;
    }
    usage();
    process.exitCode = 2;
  } finally {
    await storage.close?.();
  }
}

main().catch((error) => {
  console.error(`[graph-api] db admin failed: ${error.message}`);
  process.exitCode = 1;
});
