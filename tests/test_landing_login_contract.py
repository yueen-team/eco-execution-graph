import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LandingLoginContractTest(unittest.TestCase):
    def test_landing_has_no_hardcoded_metrics_or_partner_names(self):
        landing_html = (ROOT / "graph-ui/landing.html").read_text(encoding="utf-8")
        landing_js = (ROOT / "graph-ui/src/landing.js").read_text(encoding="utf-8")
        surface = landing_html + "\n" + landing_js

        # 数字带必须来自共有导出包实时计数,不允许写死节点/边数
        for stat_id in ["statNodes", "statEdges", "statCards", "statIssues"]:
            self.assertIn(stat_id, surface)
        self.assertNotIn(">483<", landing_html)
        self.assertNotIn(">977<", landing_html)
        self.assertIn("full-shared-graph.json", landing_js)
        # 政府合作未公开落地,不得在公开页面点名背书单位
        self.assertNotIn("监控中心", surface)
        self.assertNotIn("软著", surface)
        # 公开页面绝不出现真实企业数据来源标记
        self.assertNotIn("private-staging", surface)

    def test_landing_states_authorization_redline(self):
        landing_html = (ROOT / "graph-ui/landing.html").read_text(encoding="utf-8")
        for text in ["看得见,带不走", "永不导出", "满五家企业", "合成企业"]:
            self.assertIn(text, landing_html)

    def test_login_is_wecom_only_without_self_registration(self):
        login_html = (ROOT / "graph-ui/login.html").read_text(encoding="utf-8")
        login_js = (ROOT / "graph-ui/src/login.js").read_text(encoding="utf-8")
        surface = login_html + "\n" + login_js

        self.assertIn("企业微信扫码登录", surface)
        self.assertIn("/auth/wecom/start", surface)
        # 明确不做手机号/邮箱注册
        self.assertIn("不提供手机号或邮箱注册", surface)
        for forbidden in ["注册账号", "忘记密码", "短信验证码", "邮箱验证"]:
            self.assertNotIn(forbidden, surface)
        # 登录页不进搜索引擎
        self.assertIn("noindex", login_html)

    def test_wecom_auth_uses_official_endpoints_and_session_hardening(self):
        auth_js = (ROOT / "graph-api/src/auth.js").read_text(encoding="utf-8")
        self.assertIn("login.work.weixin.qq.com/wwlogin/sso/login", auth_js)
        self.assertIn("qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo", auth_js)
        self.assertIn("timingSafeEqual", auth_js)
        self.assertIn("HttpOnly", auth_js)


if __name__ == "__main__":
    unittest.main()
