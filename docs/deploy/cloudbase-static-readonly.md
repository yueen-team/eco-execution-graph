# CloudBase 只读静态演示部署

## 结论

第一版云端演示只部署前端静态站,目标是给主任团队看 shared 口径、审核后的 5 张执行卡、缺口报告和授权边界。

`现场经验入图审核台` 不进入本静态 shared 包。审核台属于 graph 内部工作区,真实接收与审核接口走 `graph-api/` CloudBase 云托管;静态 shared 包只保留只读演示数据。

不要直接上传 `graph-ui/dist`。普通构建产物包含内部全量演示数据文件名,只允许上传脚本生成的只读包:

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/prepare_cloudbase_static_readonly.ps1
```

生成目录:

```text
graph-ui/dist-cloudbase-static-readonly/
```

## 数据边界

只读静态包会做以下处理:

- `full-graph.json` 覆盖为 `shared_product_v1/graph.json`;
- `graph.json` 覆盖为 `shared_product_v1/graph.json`;
- `full-cards.json` 覆盖为 `shared_product_v1/cards.shared.json`;
- `cards.json` 覆盖为 `shared_product_v1/cards.shared.json`;
- 移除 `monthly-comparison.json`,因为月报对比仍等待真实脱敏历史段落的审核盲评;
- 扫描 private tier、内部模板、密钥和原始 RAG 响应标记。

不得上传:

- `data/exports/full_internal_product_v1`;
- `graph-ui/dist` 原始目录;
- `.env` 或 `.env.local`;
- 真实企业数据;
- 腾讯云密钥;
- RAG 原文响应。

## CloudBase 控制台操作

1. 进入 CloudBase 企业环境。
2. 打开静态网站托管。
3. 上传 `graph-ui/dist-cloudbase-static-readonly/` 目录内容。
4. 访问静态站 URL,打开 `/?director=1`。
5. 验证首屏为审核后的 5 张卡主线,不是云南踩雷地图或月报对比。

## 后端云托管边界

当前不需要云托管后端。后端云托管留给下一阶段:

- RAG 检索代理;
- 上下文装配接口;
- 监管口径一致性检查接口;
- 登录鉴权和审计日志;
- private runtime 只在服务端运行。

## 回滚

CloudBase 静态托管回滚方式:

1. 保留上一版静态托管上传包;
2. 如新包异常,重新上传上一版目录;
3. 如果发现 private 泄漏、真实企业数据、密钥或 RAG 原文响应,立即下线静态站并停止传播链接。

本项目当前没有执行真实云端部署。本文件只说明可部署包的生成和安全边界。
