"""AI 对话流式化测试：事件序列/审计/契约迁移。"""


def test_reasoner_model_binds_deepseek_streaming():
    """对话模型：默认 deepseek-reasoner，流式带用量（审计不丢），300s 超时容纳长思考。"""
    from features.ai import client
    from core import config

    m = client.reasoner_model()
    assert config.AI_REASONER_MODEL == "deepseek-reasoner"
    assert m.model_name == "deepseek-reasoner"
    assert m.stream_usage is True
    assert m.request_timeout == 300
