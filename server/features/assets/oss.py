"""OSS 客户端：懒加载单例，线程安全。
未配齐 OSS_* 环境变量时 configured()=False，路由层降级 503；
对象一律按"对象级 public-read"写入（桶本身保持私有，避免全桶误公开）。"""

import threading

from core import config

_bucket = None
_lock = threading.Lock()


def configured() -> bool:
    return config.oss_configured()


def _get_bucket():
    global _bucket
    if _bucket is None:
        with _lock:
            if _bucket is None:
                import oss2

                auth = oss2.Auth(config.OSS_ACCESS_KEY_ID, config.OSS_ACCESS_KEY_SECRET)
                _bucket = oss2.Bucket(auth, config.OSS_ENDPOINT, config.OSS_BUCKET, connect_timeout=10)
    return _bucket


def put_bytes(object_key: str, data: bytes, content_type: str) -> None:
    """优先显式对象级公共读（桶私有也能公开单个对象）；
    桶本身已公共读而 RAM 未授 PutObjectAcl 时，降级跟随桶权限。"""
    headers = {"x-oss-object-acl": "public-read", "Content-Type": content_type}
    try:
        _get_bucket().put_object(object_key, data, headers=headers)
    except Exception as e:
        if "acl" not in str(e).lower():
            raise
        _get_bucket().put_object(object_key, data, headers={"Content-Type": content_type})


def delete_key(object_key: str) -> None:
    _get_bucket().delete_object(object_key)


def bucket_base_url() -> str:
    """桶公网直连基座：https://{bucket}.{endpoint_host}。endpoint 允许带或不带 scheme。"""
    ep = config.OSS_ENDPOINT.strip()
    scheme, host = ("https", ep) if "://" not in ep else ep.split("://", 1)
    return f"{scheme}://{config.OSS_BUCKET}.{host.strip('/')}"
