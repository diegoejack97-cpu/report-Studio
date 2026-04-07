import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.services.email_service import send_contact_email

router = APIRouter(prefix="/api", tags=["Contact"])
logger = logging.getLogger(__name__)


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    company: str = ""
    message: str
    website: str = ""

    @field_validator("name", "company", "message", "website", mode="before")
    @classmethod
    def strip_text_fields(cls, value):
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value:
            raise ValueError("Nome é obrigatório")
        return value

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        if len(value) < 10:
            raise ValueError("Mensagem deve ter no mínimo 10 caracteres")
        return value

    @field_validator("website")
    @classmethod
    def validate_honeypot(cls, value: str) -> str:
        if value:
            raise ValueError("Spam detectado")
        return value


@router.post("/contact", status_code=200)
async def create_contact_lead(payload: ContactRequest):
    logger.info(
        "Novo lead comercial recebido. email=%s empresa=%s mensagem_chars=%s",
        payload.email,
        payload.company or "nao_informada",
        len(payload.message),
    )

    sent, error_detail = await send_contact_email(
        name=payload.name,
        email=str(payload.email),
        company=payload.company,
        message=payload.message,
    )

    if not sent:
        logger.error(
            "Falha ao enviar lead comercial via Resend. email=%s detalhe=%s",
            payload.email,
            error_detail or "sem_detalhe",
        )
        raise HTTPException(status_code=502, detail="Não foi possível enviar sua mensagem no momento")

    logger.info("Lead comercial enviado com sucesso. email=%s", payload.email)
    return {"message": "Mensagem enviada com sucesso! Entraremos em contato em breve."}
