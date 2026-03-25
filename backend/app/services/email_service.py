import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, body: str) -> bool:
    try:
        if not settings.RESEND_API_KEY:
            logger.warning("Email nao enviado: RESEND_API_KEY nao configurada.")
            return False

        if not to:
            logger.warning("Email nao enviado: destinatario ausente.")
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

        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            response = await client.post(RESEND_API_URL, json=payload, headers=headers)
            response.raise_for_status()

        logger.info("Email transacional enviado com sucesso para %s.", to)
        return True
    except Exception:
        logger.exception("Falha ao enviar email transacional para %s.", to)
        return False
