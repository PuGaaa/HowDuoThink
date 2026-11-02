"""settings 路由：管理端读写（admin 专属）+ 客户端配置下发（公开只读白名单）。"""

from fastapi import APIRouter, Depends, HTTPException

from core import settings
from core.deps import current_user, require_admin
from features.settings import models

router = APIRouter(tags=["settings"])


@router.get("/api/admin/settings")
def admin_list_settings(uid: str = Depends(current_user)):
    require_admin(uid)
    items = []
    for key, d in settings.REGISTRY.items():
        items.append(
            {
                "key": key,
                "value": settings.get(key),
                "source": settings.source_of(key),
                "group": d.group,
                "label": d.label,
                "unit": d.unit,
                "min": d.min_v,
                "max": d.max_v,
            }
        )
    return {"items": items}


@router.put("/api/admin/settings")
def admin_update_settings(body: models.SettingsUpdateBody, uid: str = Depends(current_user)):
    require_admin(uid)
    try:
        settings.update_many(body.values, uid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.get("/api/app-config")
def app_config():
    """客户端运行时配置：仅 client scope 白名单，无鉴权、无敏感项。"""
    return settings.client_config()
