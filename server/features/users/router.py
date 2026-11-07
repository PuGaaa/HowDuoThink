"""users 路由：管理端用户管理（admin 专属）+ 用户自助注销账号。"""

from fastapi import APIRouter, Depends, Query

from core.deps import current_user, require_admin
from features.users import models, service

router = APIRouter(tags=["users"])


@router.get("/api/admin/users")
def admin_users(
    uid: str = Depends(current_user),
    query: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    require_admin(uid)
    return service.list_users(query, page, page_size)


@router.patch("/api/admin/users/{target}/role")
def admin_update_role(target: str, body: models.RoleUpdate, uid: str = Depends(current_user)):
    require_admin(uid)
    return service.update_role(target, body.role, uid)


@router.patch("/api/admin/users/{target}/status")
def admin_update_status(target: str, body: models.StatusUpdate, uid: str = Depends(current_user)):
    require_admin(uid)
    return service.set_status(target, body.status, uid)


@router.post("/api/me/delete")
def delete_me(uid: str = Depends(current_user)):
    """用户自助注销账号（匿名化，uid 保留）；语义见 service.delete_account。"""
    return service.delete_account(uid)
