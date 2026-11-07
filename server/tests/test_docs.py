"""docs：隐私政策公开读取 + 管理端编辑 + 未知文档 404。

鉴权依赖先于存在性检查：未登录写 → 401（即使 doc_id 也不存在）。"""

from tests.conftest import login_admin, make_client


def test_default_policy_public():
    with make_client() as client:
        r = client.get("/api/docs/privacy-policy")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["customized"] is False
        assert body["updatedBy"] is None
        assert "好多星隐私政策" in body["content"]


def test_unknown_doc_404():
    with make_client() as client:
        assert client.get("/api/docs/nope").status_code == 404
        # 未登录：依赖（401）先于 404
        assert client.put("/api/admin/docs/nope", json={"content": "x"}).status_code == 401
        # 登录后：doc_id 不存在 → 404
        login_admin(client)
        assert client.put("/api/admin/docs/nope", json={"content": "x"}).status_code == 404


def test_admin_edit_flow():
    with make_client() as client:
        # 未登录写 → 401
        assert client.put("/api/admin/docs/privacy-policy", json={"content": "自定义"}).status_code == 401
        # 保存后公开读取返回自定义内容
        login_admin(client)
        r = client.put("/api/admin/docs/privacy-policy", json={"content": "自定义隐私政策文本"})
        assert r.status_code == 200, r.text
        body = client.get("/api/docs/privacy-policy").json()
        assert body["customized"] is True
        assert body["content"] == "自定义隐私政策文本"
        assert body["updatedBy"] == "pw-admin"
        assert body["updatedAt"] is not None


def test_edit_body_validation():
    with make_client() as client:
        login_admin(client)
        assert client.put("/api/admin/docs/privacy-policy", json={"content": ""}).status_code == 422
        assert client.put("/api/admin/docs/privacy-policy", json={"content": "x" * 20001}).status_code == 422
