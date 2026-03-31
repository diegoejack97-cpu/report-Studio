import asyncio
import logging

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def _post_email(payload: dict, headers: dict):
    return requests.post(
        RESEND_API_URL,
        json=payload,
        headers=headers,
        timeout=10,
    )


async def send_email(to: str, subject: str, body: str) -> bool:
    try:
        if not settings.RESEND_API_KEY:
            logger.error("Email nao enviado: RESEND_API_KEY nao configurada.")
            return False

        if not to:
            logger.error("Email nao enviado: destinatario ausente.")
            return False

        if not settings.EMAIL_FROM:
            logger.error("Email nao enviado: EMAIL_FROM nao configurado.")
            return False

        payload = {
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "text": body,
        }
        headers = {
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        }

        response = await asyncio.to_thread(_post_email, payload, headers)
        if response.status_code >= 400:
            logger.error("Falha ao enviar email via Resend.")
            logger.error("Status HTTP: %s", response.status_code)
            logger.error("Resposta completa: %s", response.text)
            logger.error("Possiveis causas: API key invalida, dominio nao verificado ou EMAIL_FROM invalido.")
            return False

        logger.info("Email transacional enviado com sucesso para %s.", to)
        logger.info("Status HTTP: %s", response.status_code)
        logger.info("Resposta da API: %s", response.text)
        return True
    except Exception:
        logger.exception("Falha ao enviar email transacional para %s.", to)
        return False
