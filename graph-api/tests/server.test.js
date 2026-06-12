import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorized } from "../src/server.js";

test("未配置访问令牌时允许本地开发请求", () => {
  assert.equal(isAuthorized({}, ""), true);
});

test("配置访问令牌后必须使用 Bearer 头", () => {
  assert.equal(isAuthorized({}, "secret-for-test"), false);
  assert.equal(isAuthorized({ authorization: "Bearer wrong" }, "secret-for-test"), false);
  assert.equal(isAuthorized({ authorization: "Bearer secret-for-test" }, "secret-for-test"), true);
});
