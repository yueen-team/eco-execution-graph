import { defineConfig } from "vite";

// 本机联调:graph-api 默认跑在 8787,dev server 把 /api 代理过去;
// api 未启动时代理 502,前端按可选请求回落到演示数据,不影响纯前端开发。
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.ECO_GRAPH_API_PROXY || "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
