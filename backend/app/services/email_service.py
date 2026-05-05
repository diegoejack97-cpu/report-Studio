import asyncio
import html
import logging

import requests

from app.core.config import settings
from app.core.log_safety import mask_email

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def _post_email(payload: dict, headers: dict):
    return requests.post(
        RESEND_API_URL,
        json=payload,
        headers=headers,
        timeout=10,
    )


async def _send_resend_email(payload: dict, *, log_context: str) -> tuple[bool, str | None]:
    try:
        if not settings.RESEND_API_KEY:
            logger.error("%s: RESEND_API_KEY nao configurada.", log_context)
            return False, "RESEND_API_KEY nao configurada"

        if not settings.EMAIL_FROM:
            logger.error("%s: EMAIL_FROM nao configurado.", log_context)
            return False, "EMAIL_FROM nao configurado"

        headers = {
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        }

        response = await asyncio.to_thread(_post_email, payload, headers)
        if response.status_code >= 400:
            logger.error("%s: falha ao enviar email via Resend.", log_context)
            logger.error("%s: status HTTP %s", log_context, response.status_code)
            logger.error(
                "%s: resposta da API omitida por seguranca. response_chars=%s",
                log_context,
                len(response.text or ""),
            )
            return False, f"Erro da API Resend (status {response.status_code})"

        logger.info("%s: email enviado com sucesso.", log_context)
        logger.info("%s: status HTTP %s", log_context, response.status_code)
        logger.info(
            "%s: resposta da API recebida com sucesso. response_chars=%s",
            log_context,
            len(response.text or ""),
        )
        return True, None
    except Exception:
        logger.exception("%s: excecao ao enviar email via Resend.", log_context)
        return False, "Erro interno ao enviar email"


async def send_email(to: str, subject: str, body: str) -> bool:
    if not to:
        logger.error("Email nao enviado: destinatario ausente.")
        return False

    payload = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "text": body,
    }

    sent, _ = await _send_resend_email(
        payload,
        log_context=f"email_transacional:{mask_email(to)}",
    )
    return sent


async def send_contact_email(*, name: str, email: str, phone: str, company: str, message: str) -> tuple[bool, str | None]:
    if not settings.CONTACT_EMAIL:
        logger.error("lead_comercial: CONTACT_EMAIL nao configurado.")
        return False, "CONTACT_EMAIL nao configurado"

    escaped_name = html.escape(name)
    escaped_email = html.escape(email)
    escaped_phone = html.escape(phone or "Nao informado")
    escaped_company = html.escape(company or "Nao informado")
    escaped_message = html.escape(message).replace("\n", "<br />")

    payload = {
        "from": f"ReportFlow <{settings.EMAIL_FROM}>",
        "to": [settings.CONTACT_EMAIL],
        "reply_to": email,
        "subject": "Novo lead - Plano empresarial",
        "html": (
            "<h2>Novo lead comercial</h2>"
            f"<p><strong>Nome:</strong> {escaped_name}</p>"
            f"<p><strong>Email:</strong> {escaped_email}</p>"
            f"<p><strong>Telefone:</strong> {escaped_phone}</p>"
            f"<p><strong>Empresa:</strong> {escaped_company}</p>"
            f"<p><strong>Mensagem:</strong><br />{escaped_message}</p>"
        ),
        "text": (
            "Novo lead comercial\n\n"
            f"Nome: {name}\n"
            f"Email: {email}\n"
            f"Telefone: {phone or 'Nao informado'}\n"
            f"Empresa: {company or 'Nao informado'}\n"
            f"Mensagem:\n{message}"
        ),
    }

    return await _send_resend_email(
        payload,
        log_context=f"lead_comercial:{mask_email(email)}",
    )
