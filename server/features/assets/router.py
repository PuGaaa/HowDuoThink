"""素材路由：上传/列表/删除、资源位绑定（editor+，管理端素材页用）；
清单与资源派发公开只读（App 启动拉取）。"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from core import config
from core.deps import current_user, require_editor
from features.assets import models, oss, service

logger = logging.getLogger("server")

router = APIRouter(tags=["assets"])


@router.get("/api/assets/manifest")
def assets_manifest():
    """公开只读：素材清单（key/url/category/sha256），无敏感项。"""
    return service.manifest()


@router.get("/api/app-resources")
def app_resources():
    """公开只读：App 启动预取的吉祥物槽位 URL 表 + 头像池。"""
    return service.app_resources()


@router.get("/api/assets/slots")
def list_slots(uid: str = Depends(current_user)):
    require_editor(uid)
    return {"items": service.slots_admin()}


@router.put("/api/assets/slots/{slot}")
def bind_slot(slot: str, body: models.SlotBindBody, uid: str = Depends(current_user)):
    require_editor(uid)
    try:
        service.bind_slot(slot, body.asset_id, uid)
    except service.SlotError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.delete("/api/assets/slots/{slot}")
def unbind_slot(slot: str, uid: str = Depends(current_user)):
    require_editor(uid)
    try:
        service.unbind_slot(slot)
    except service.SlotError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.get("/api/assets")
def list_assets(category: str | None = None, uid: str = Depends(current_user)):
    require_editor(uid)
    return {"items": service.list_rows(category)}


@router.post("/api/assets")
async def upload_asset(
    file: UploadFile = File(...),
    category: str = Form("misc"),
    note: str = Form(""),
    uid: str = Depends(current_user),
):
    require_editor(uid)
    # 读文件前的两道闸：未配置先 503（不吃一次内存）；声明大小超限先 413
    # （Starlette 的 read() 会把假脱机文件整体载入 RAM，读后校验挡不住 OOM）
    if not oss.configured():
        raise HTTPException(503, "OSS 未配置：部署环境需补齐 OSS_* 环境变量")
    max_bytes = config.OSS_MAX_UPLOAD_MB * 1024 * 1024
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(413, f"文件超过上限 {config.OSS_MAX_UPLOAD_MB}MB")
    data = await file.read()
    try:
        return service.upload(data, file.filename or "", category, note, uid)
    except service.NotConfiguredError:
        raise HTTPException(503, "OSS 未配置：部署环境需补齐 OSS_* 环境变量")
    except service.RateLimitError as e:
        raise HTTPException(429, str(e))
    except service.AssetError as e:
        raise HTTPException(400, str(e))
    except service.AssetUnavailableError as e:
        logger.warning("素材上传 OSS 写入失败：%s", e)
        raise HTTPException(502, "OSS 暂不可用，请稍后重试")


@router.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: int, uid: str = Depends(current_user)):
    require_editor(uid)
    try:
        service.delete(asset_id, uid)
    except service.AssetError as e:
        raise HTTPException(400, str(e))
    except service.AssetUnavailableError as e:
        logger.warning("素材删除 OSS 失败：%s", e)
        raise HTTPException(502, "OSS 暂不可用，请稍后重试")
    return {"ok": True}
