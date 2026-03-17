from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.auth import get_current_user, hash_password, verify_password
from app.models.user import User

router = APIRouter()


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.put("/me")
async def update_profile(
    data: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.full_name is not None:
        current_user.full_name = data.full_name

    if data.new_password:
        if not data.current_password:
            raise HTTPException(status_code=400, detail="Senha atual obrigatória")
        if not verify_password(data.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
        if len(data.new_password) < 8:
            raise HTTPException(status_code=400, detail="Nova senha muito curta")
        current_user.hashed_password = hash_password(data.new_password)

    await db.flush()
    return {"message": "Perfil atualizado com sucesso"}
