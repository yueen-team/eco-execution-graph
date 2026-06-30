import test from "node:test";
import assert from "node:assert/strict";
import {
  lkeConfigFromEnv,
  tc3Sign,
  sha256hex,
  hmacSha256,
  tc3Call,
  retrieveKnowledge,
  sanitizeRetrieveRecord,
  buildRagFetch,
  TencentCloudError,
} from "../src/tc3-rag-client.js";

// 离线纪律:全程 stub 注入 fetchImpl / env,绝不触网。所有时间戳显式注入,签名确定可断言。

// ── 固定 known-vector(JS tc3Sign 与 pipeline/tencent_cloud_signer.py 算法交叉验证一致)──
const VECTOR = {
  secretId: "AKIDEXAMPLE1234567890",
  secretKey: "SecretKeyExample0987654321",
  timestamp: 1700000000, // UTC 2023-11-14
  action: "RetrieveKnowledge",
  payload: { KnowledgeBaseId: "kb-eco-001", Query: "危废标签不规范", RetrievalSetting: { TopK: 3 } },
};
const EXPECTED_BODY = '{"KnowledgeBaseId":"kb-eco-001","Query":"危废标签不规范","RetrievalSetting":{"TopK":3}}';
const EXPECTED_DATE = "2023-11-14";
const EXPECTED_SIGNATURE = "9a1acfce762f2d4cabd77b123b9927f717d9c744b08cded2af814c1a59cd3b3b";

// OpenAI 兼容前的更底层:腾讯云返回 {Response:{...}};stub 暴露 calls 以断言 sign-what-you-send。
function stubFetch(responseBody, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => responseBody };
  };
  impl.calls = calls;
  return impl;
}

function vectorConfig(extra = {}) {
  return lkeConfigFromEnv({
    TENCENT_LKE_SECRET_ID: VECTOR.secretId,
    TENCENT_LKE_SECRET_KEY: VECTOR.secretKey,
    TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-eco-001",
    ...extra,
  });
}

test("known-vector:固定 secretKey/timestamp/payload → 确定签名 + body 紧凑不转义非 ASCII", () => {
  const signed = tc3Sign({
    secretId: VECTOR.secretId,
    secretKey: VECTOR.secretKey,
    action: VECTOR.action,
    payload: VECTOR.payload,
    timestamp: VECTOR.timestamp,
  });
  assert.equal(signed.body, EXPECTED_BODY);
  assert.equal(signed.date, EXPECTED_DATE);
  assert.equal(signed.signature, EXPECTED_SIGNATURE);
  assert.equal(signed.headers["X-TC-Timestamp"], "1700000000");
  assert.equal(signed.headers["X-TC-Action"], "RetrieveKnowledge"); // 头保留原大小写
  assert.equal(signed.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(signed.headers.Host, "lkeap.tencentcloudapi.com");
  assert.equal(signed.headers["X-TC-Version"], "2024-05-22");
  assert.equal(
    signed.headers.Authorization,
    `TC3-HMAC-SHA256 Credential=${VECTOR.secretId}/${EXPECTED_DATE}/lkeap/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${EXPECTED_SIGNATURE}`,
  );
});

test("known-vector:canonicalRequest 含必须的空行(CanonicalQueryString)+ 头块以 \\n 结尾", () => {
  const signed = tc3Sign({ secretId: VECTOR.secretId, secretKey: VECTOR.secretKey, action: VECTOR.action, payload: VECTOR.payload, timestamp: VECTOR.timestamp });
  const lines = signed.canonicalRequest.split("\n");
  assert.equal(lines[0], "POST");
  assert.equal(lines[1], "/");
  assert.equal(lines[2], ""); // ★ #1 易错:空的 CanonicalQueryString 行
  assert.equal(lines[3], "content-type:application/json; charset=utf-8");
  assert.equal(lines[4], "host:lkeap.tencentcloudapi.com");
  assert.equal(lines[5], "x-tc-action:retrieveknowledge"); // canonical 内 action 小写
  assert.equal(lines[6], ""); // 头块末尾 \n 与 signedHeaders 间再 \n → 空行,必须有
  assert.equal(lines[7], "content-type;host;x-tc-action");
  assert.equal(lines[8], sha256hex(EXPECTED_BODY));
});

test("crypto 基元:sha256hex / hmacSha256 与 node:crypto 字节一致(派生中段为 raw digest Buffer)", () => {
  assert.equal(sha256hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  const digest = hmacSha256(Buffer.from("TC3secret", "utf8"), "2023-11-14");
  assert.ok(Buffer.isBuffer(digest));
  assert.equal(digest.length, 32); // raw 32 字节,供下段 HMAC 作 key
});

test("sign-what-you-send:实际发送的 body === 被签名 hash 的同一 body 串", async () => {
  const config = vectorConfig();
  const fetchImpl = stubFetch({ Response: { Records: [] } });
  // 注入固定 nowSeconds 让发送时间戳确定,从而能独立重签比对。
  await tc3Call({
    config,
    action: VECTOR.action,
    payload: VECTOR.payload,
    fetchImpl,
    nowSeconds: () => VECTOR.timestamp,
  });
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, "https://lkeap.tencentcloudapi.com/");
  // ① 发送的 body 字节 === 紧凑非转义序列化(同 Python ensure_ascii=False)
  assert.equal(init.body, EXPECTED_BODY);
  // ② 用【发送出去的 body + 发送出去的时间戳】独立重签,Authorization 必须复现 → 证明送的就是签的那串
  const sentTs = Number(init.headers["X-TC-Timestamp"]);
  const resigned = tc3Sign({ secretId: VECTOR.secretId, secretKey: VECTOR.secretKey, action: VECTOR.action, body: init.body, timestamp: sentTs });
  assert.equal(resigned.headers.Authorization, init.headers.Authorization);
  assert.equal(resigned.body, init.body);
  // ③ 该次发送的签名正是 known-vector 期望值(nowSeconds 固定为 1700000000)
  assert.equal(init.headers.Authorization, `TC3-HMAC-SHA256 Credential=${VECTOR.secretId}/${EXPECTED_DATE}/lkeap/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${EXPECTED_SIGNATURE}`);
});

test("retrieveKnowledge:stub Records → sanitize 出 excerpt(法条原文)、丢 Metadata 企业噪声键", async () => {
  const config = vectorConfig();
  const fetchImpl = stubFetch({
    Response: {
      RequestId: "req-001",
      Records: [
        {
          Title: "中华人民共和国固体废物污染环境防治法 第七十八条",
          Content: "第七十八条 产生危险废物的单位,应当按照国家有关规定制定危险废物管理计划,并向所在地生态环境主管部门申报。",
          Score: 0.87,
          Metadata: {
            DocumentId: "doc-solid-78",
            ArticleNo: "第七十八条",
            // 以下是必须被丢弃的企业噪声 / 私有字段
            CompanyName: "某某环保科技有限公司",
            企业名称: "某某环保科技有限公司",
            经度: "120.123",
          },
        },
      ],
    },
  });
  const records = await retrieveKnowledge({ config, query: "危废标签不规范", knowledgeBaseId: "kb-eco-001", fetchImpl });
  assert.equal(records.length, 1);

  const clean = sanitizeRetrieveRecord(records[0]);
  assert.equal(clean.rag_doc_ref, "doc-solid-78");
  assert.equal(clean.title, "中华人民共和国固体废物污染环境防治法 第七十八条");
  assert.equal(clean.locator, "第七十八条");
  assert.equal(clean.score, 0.87);
  // excerpt = 法条原文(record.Content)
  assert.ok(clean.excerpt.includes("第七十八条 产生危险废物的单位"));

  // 脱敏断言:序列化产物绝不含 Metadata 原始噪声键/值
  const cleanText = JSON.stringify(clean);
  for (const noise of ["Metadata", "CompanyName", "企业名称", "某某环保科技有限公司", "经度", "120.123"]) {
    assert.equal(cleanText.includes(noise), false, `sanitize 不得含噪声 ${noise}`);
  }
  // 输出键白名单严格五字段
  assert.deepEqual(Object.keys(clean).sort(), ["excerpt", "locator", "rag_doc_ref", "score", "title"]);
});

test("buildRagFetch:缺 LKE 凭证 / 占位 / 无知识库 id → 返回 null(=>降级)", () => {
  assert.equal(buildRagFetch({}), null);
  assert.equal(
    buildRagFetch({ TENCENT_LKE_SECRET_ID: "your-secret-id", TENCENT_LKE_SECRET_KEY: "your-secret-key", TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-1" }),
    null,
    "占位凭证视为未配置",
  );
  assert.equal(
    buildRagFetch({ TENCENT_LKE_SECRET_ID: "请填入", TENCENT_LKE_SECRET_KEY: "请填入", TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-1" }),
    null,
  );
  assert.equal(
    buildRagFetch({ TENCENT_LKE_SECRET_ID: "AKIDreal", TENCENT_LKE_SECRET_KEY: "skreal" }),
    null,
    "有凭证但无知识库 id 也降级",
  );
});

test("buildRagFetch:有凭证 → 返回注入函数;多知识库循环检索 + 去重 + 只收有 excerpt 的引文", async () => {
  const env = {
    TENCENT_LKE_SECRET_ID: VECTOR.secretId,
    TENCENT_LKE_SECRET_KEY: VECTOR.secretKey,
    TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-1,kb-2",
  };
  // 两个知识库都返回同一条(同 DocumentId)→ 去重后只剩 1 条。
  const fetchImpl = stubFetch({
    Response: {
      Records: [
        {
          Title: "固废法 第七十八条",
          Content: "第七十八条 产生危险废物的单位...",
          Metadata: { DocumentId: "doc-78", 企业名称: "脱敏前不该出现的企业" },
        },
      ],
    },
  });
  const ragFetch = buildRagFetch(env, { fetchImpl });
  assert.equal(typeof ragFetch, "function");

  const out = await ragFetch({
    item: { "建议问题类型": "危废标签不规范", "法条规范候选": [{ "名称": "固体废物污染环境防治法" }] },
    graphContext: {},
  });
  assert.equal(out.available, true);
  assert.equal(out.citations.length, 1, "同 DocumentId 跨库去重");
  assert.ok(out.citations[0].excerpt.includes("第七十八条"));
  assert.equal(out.citations[0].rag_doc_ref, "doc-78");
  assert.equal(fetchImpl.calls.length, 2, "两个知识库各检索一次(单 id,不传数组)");

  const outText = JSON.stringify(out);
  for (const noise of ["企业名称", "脱敏前不该出现的企业", "Metadata"]) {
    assert.equal(outText.includes(noise), false, `ragFetch 产物不得含噪声 ${noise}`);
  }
});

test("buildRagFetch:每条法条候选各自检索,填错的「建议问题类型」绝不进查询(防污染);多候选 → 候选×库 次", async () => {
  const env = {
    TENCENT_LKE_SECRET_ID: VECTOR.secretId,
    TENCENT_LKE_SECRET_KEY: VECTOR.secretKey,
    TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-1,kb-2",
  };
  const fetchImpl = stubFetch({ Response: { Records: [] } });
  const ragFetch = buildRagFetch(env, { fetchImpl });
  await ragFetch({
    item: {
      "建议问题类型": "雨污分流不彻底", // 故意填错:旧拼接式查询会被它带偏
      "法条规范候选": [
        { "名称": "GB 18597 危险废物贮存污染控制标准" },
        { "名称": "固体废物污染环境防治法 第七十七条" },
      ],
    },
    graphContext: {},
  });
  assert.equal(fetchImpl.calls.length, 4, "2 候选 × 2 库 = 4 次,每条单候选检索");
  const queries = fetchImpl.calls.map((c) => JSON.parse(c.init.body).Query);
  for (const q of queries) {
    assert.equal(q.includes("雨污分流"), false, "填错的建议问题类型绝不进检索查询(防污染)");
  }
  assert.ok(queries.some((q) => q.includes("GB 18597")), "应按法条候选名称检索");
  assert.ok(queries.some((q) => q.includes("第七十七条")), "应按法条候选名称检索");
});

test("buildRagFetch:无法条候选但有建议问题类型 → 回退用类型检索(单查询)", async () => {
  const env = {
    TENCENT_LKE_SECRET_ID: VECTOR.secretId,
    TENCENT_LKE_SECRET_KEY: VECTOR.secretKey,
    TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-1",
  };
  const fetchImpl = stubFetch({ Response: { Records: [] } });
  const ragFetch = buildRagFetch(env, { fetchImpl });
  await ragFetch({ item: { "建议问题类型": "危废标签不规范" }, graphContext: {} });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).Query, "危废标签不规范", "无候选时回退到建议问题类型");
});

test("buildRagFetch:item 无法条候选/建议问题类型(空 query)→ {citations:[],available:false},不发请求", async () => {
  const env = {
    TENCENT_LKE_SECRET_ID: VECTOR.secretId,
    TENCENT_LKE_SECRET_KEY: VECTOR.secretKey,
    TENCENT_LKE_KNOWLEDGE_BASE_IDS: "kb-1",
  };
  const fetchImpl = stubFetch({ Response: { Records: [] } });
  const ragFetch = buildRagFetch(env, { fetchImpl });
  const out = await ragFetch({ item: {}, graphContext: {} });
  assert.deepEqual(out, { citations: [], available: false });
  assert.equal(fetchImpl.calls.length, 0, "空 query 不触网");
});

test("Response.Error → 抛 TencentCloudError(带 code/detail/requestId)", async () => {
  const config = vectorConfig();
  const fetchImpl = stubFetch({
    Response: { Error: { Code: "AuthFailure.SignatureFailure", Message: "签名校验失败" }, RequestId: "req-err" },
  });
  await assert.rejects(
    () => retrieveKnowledge({ config, query: "x", knowledgeBaseId: "kb-1", fetchImpl }),
    (error) => {
      assert.ok(error instanceof TencentCloudError);
      assert.equal(error.code, "AuthFailure.SignatureFailure");
      assert.equal(error.detail, "签名校验失败");
      assert.equal(error.requestId, "req-err");
      return true;
    },
  );
});

test("时钟偏移单次重试:SignatureExpire(带 server time)→ 取 serverTime 重签重发一次,第二次时间戳对齐", async () => {
  const config = vectorConfig();
  const serverTime = 1900000000;
  const localNow = 1700000000; // 固定本地时钟,offset = serverTime - localNow
  const calls = [];
  let attempt = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    attempt += 1;
    if (attempt === 1) {
      return {
        ok: true,
        json: async () => ({
          Response: { Error: { Code: "AuthFailure.SignatureExpire", Message: `request expired, server time ${serverTime}, please retry` } },
        }),
      };
    }
    return { ok: true, json: async () => ({ Response: { Records: [{ Title: "t", Content: "c" }] } }) };
  };
  const records = await retrieveKnowledge({ config, query: "x", knowledgeBaseId: "kb-1", fetchImpl, /* nowSeconds via tc3Call default */ });
  // retrieveKnowledge 走 tc3Call 默认 nowSeconds(真实时钟);为确定性只断言重试发生 + 第二次时间戳被服务器时间纠偏。
  assert.equal(records.length, 1);
  assert.equal(calls.length, 2, "时钟偏移触发恰好一次重试");
  const secondTs = Number(calls[1].init.headers["X-TC-Timestamp"]);
  assert.ok(Math.abs(secondTs - serverTime) <= 5, `第二次时间戳应被纠偏到 server time 附近,实得 ${secondTs}`);
  assert.equal(config.timeOffsetSeconds !== 0, true, "offset 已被服务器时间纠正并留存");
});

test("retrieveKnowledge:payload 形状 KnowledgeBaseId/Query/RetrievalSetting.TopK(单 id,不传数组)", async () => {
  const config = vectorConfig();
  const fetchImpl = stubFetch({ Response: { Records: [] } });
  await retrieveKnowledge({ config, query: "危废", knowledgeBaseId: "kb-single", topK: 5, fetchImpl });
  const body = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(body.KnowledgeBaseId, "kb-single");
  assert.equal(typeof body.KnowledgeBaseId, "string"); // 单个字符串,非数组
  assert.equal(body.Query, "危废");
  assert.deepEqual(body.RetrievalSetting, { TopK: 5 });
});

test("未配置凭证:tc3Call 直接抛(绝不触网)", async () => {
  const fetchImpl = stubFetch({ Response: { Records: [] } });
  await assert.rejects(
    () => tc3Call({ config: lkeConfigFromEnv({}), action: VECTOR.action, payload: VECTOR.payload, fetchImpl }),
    /未配置/,
  );
  assert.equal(fetchImpl.calls.length, 0);
});
