import fs from "node:fs/promises";
import path from "node:path";

export async function readJsonl(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeJsonl(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(filePath, body ? `${body}\n` : "", "utf8");
}

export async function upsertByReviewId(filePath, item) {
  const rows = await readJsonl(filePath);
  const index = rows.findIndex((row) => row["审核编号"] === item["审核编号"]);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  await writeJsonl(filePath, rows);
  return item;
}
