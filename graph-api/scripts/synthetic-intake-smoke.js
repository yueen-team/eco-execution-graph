import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fixture from "../../data/fixtures/ecocheck-field-event-fixture.json" with { type: "json" };
import profileGapFixture from "../../data/fixtures/ecocheck-profile-gap-confirmed-fixture.json" with { type: "json" };
import { issueSession } from "../src/auth.js";
import { createServer } from "../src/server.js";

const apiToken = "synthetic-smoke-token";
const sessionSecret = "synthetic-smoke-session-secret-32chars";
const temp = path.join(os.tmpdir(), `eco-graph-intake-smoke-${Date.now()}`);
const stagingPath = path.join(temp, "field-events.jsonl");
const wecom = {
  corpId: "synthetic-corp",
  agentId: "synthetic-agent",
  corpSecret: "synthetic-secret",
  redirectUri: "https://synthetic.example/auth/wecom/callback",
  allowedUsers: [],
  reviewUsers: ["eto.synthetic", "admin.synthetic"],
  sessionSecret,
};

function jsonHeaders(extra = {}) {
  return { "content-type": "application/json", ...extra };
}

async function main() {
  await mkdir(temp, { recursive: true });
  const server = createServer({ stagingPath, apiToken, wecom });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bearer = { authorization: `Bearer ${apiToken}` };
  const reviewCookie = { cookie: `eco_graph_session=${issueSession("eto.synthetic", sessionSecret)}` };
  const memberCookie = { cookie: `eco_graph_session=${issueSession("member.synthetic", sessionSecret)}` };

  try {
    const memberDenied = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers: jsonHeaders(memberCookie),
      body: JSON.stringify(fixture),
    });
    assert.equal(memberDenied.status, 403);

    const semantic = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers: jsonHeaders(bearer),
      body: JSON.stringify(fixture),
    });
    assert.equal(semantic.status, 201);
    const semanticBody = await semantic.json();
    assert.equal(semanticBody.item["事件类别"], "semantic_event");
    assert.equal(semanticBody.item["当前审核状态"], "待审核");
    assert.equal(semanticBody.item["业务幂等键"], "synthetic-inspection-001");

    const profileGap = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers: jsonHeaders(reviewCookie),
      body: JSON.stringify(profileGapFixture),
    });
    assert.equal(profileGap.status, 201);
    const profileGapBody = await profileGap.json();
    assert.equal(profileGapBody.item["事件类别"], "profile_gap_confirmed");
    assert.equal(profileGapBody.item["是否允许进入聚合"], false);
    assert.equal(profileGapBody.item["不可聚合原因"], "profile_gap_not_field_issue");

    const reviewDenied = await fetch(`${base}/api/review/field-events`, { headers: memberCookie });
    assert.equal(reviewDenied.status, 403);

    const reviewAllowed = await fetch(`${base}/api/review/field-events`, { headers: reviewCookie });
    assert.equal(reviewAllowed.status, 200);
    const reviewBody = await reviewAllowed.json();
    assert.equal(reviewBody.items.length, 2);

    console.log(JSON.stringify({
      status: "pass",
      semantic_event: "pass",
      profile_gap_confirmed: "pass",
      member_review_access: "denied",
      cleanup: temp,
    }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
