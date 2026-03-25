import logging

from app.services.email_service import send_email

logger = logging.getLogger(__name__)


async def send_welcome_email(user):
    try:
        await _send_user_email(
            user=user,
            subject="Bem-vindo ao Report Studio",
            body=(
                f"Ola, {_display_name(user)}!\n\n"
                "Sua conta foi criada com sucesso no Report Studio.\n"
                "Agora voce ja pode acessar a plataforma e comecar a criar seus relatorios.\n\n"
                "Se precisar de ajuda, responda este email."
            ),
        )
    except Exception:
        logger.exception("Falha ao preparar email de boas-vindas.")


async def send_payment_success_email(user):
    try:
        await _send_user_email(
            user=user,
            subject="Pagamento confirmado",
            body=(
                f"Ola, {_display_name(user)}!\n\n"
                "Recebemos a confirmacao do seu pagamento com sucesso.\n"
                "Seu plano ja esta ativo e pronto para uso.\n\n"
                "Obrigado por continuar com o Report Studio."
            ),
        )
    except Exception:
        logger.exception("Falha ao preparar email de pagamento confirmado.")


async def send_payment_failed_email(user):
    try:
        await _send_user_email(
            user=user,
            subject="Falha no pagamento",
            body=(
                f"Ola, {_display_name(user)}!\n\n"
                "Nao conseguimos processar o pagamento da sua assinatura.\n"
                "Verifique seu metodo de pagamento para evitar interrupcoes no acesso.\n\n"
                "Se precisar, tente novamente pela area de assinatura."
            ),
        )
    except Exception:
        logger.exception("Falha ao preparar email de falha no pagamento.")


async def send_report_ready_email(user, report_name):
    try:
        await _send_user_email(
            user=user,
            subject="Seu relatorio esta pronto",
            body=(
                f"Ola, {_display_name(user)}!\n\n"
                f'O relatorio "{report_name}" foi gerado com sucesso e esta pronto para uso.\n'
                "Voce ja pode acessar a plataforma para visualizar ou exportar o resultado.\n\n"
                "Obrigado por usar o Report Studio."
            ),
        )
    except Exception:
        logger.exception("Falha ao preparar email de relatorio pronto.")


async def send_limit_reached_email(user):
    try:
        await _send_user_email(
            user=user,
            subject="Limite do plano atingido",
            body=(
                f"Ola, {_display_name(user)}!\n\n"
                "Voce atingiu o limite do seu plano atual.\n"
                "Para continuar criando novos relatorios, faca upgrade da sua assinatura.\n\n"
                "Se precisar, nossa equipe pode ajudar na escolha do melhor plano."
            ),
        )
    except Exception:
        logger.exception("Falha ao preparar email de limite atingido.")


async def send_processing_error_email(user, error_message):
    try:
        await _send_user_email(
            user=user,
            subject="Erro no processamento",
            body=(
                f"Ola, {_display_name(user)}!\n\n"
                "Ocorreu um erro ao processar sua solicitacao.\n"
                f"Detalhes: {error_message}\n\n"
                "Nossa equipe ja pode investigar o ocorrido se o problema persistir."
            ),
        )
    except Exception:
        logger.exception("Falha ao preparar email de erro no processamento.")


async def _send_user_email(user, subject: str, body: str):
    try:
        email = getattr(user, "email", None)
        if not email:
            logger.warning("Email transacional ignorado: usuario sem email.")
            return False

        sent = await send_email(to=email, subject=subject, body=body)
        if sent:
            logger.info("Evento de email processado com sucesso para %s.", email)
        else:
            logger.warning("Evento de email concluido sem envio para %s.", email)
        return sent
    except Exception:
        logger.exception("Falha ao executar evento de email para usuario.")
        return False


def _display_name(user) -> str:
    full_name = (getattr(user, "full_name", "") or "").strip()
    return full_name or getattr(user, "email", "cliente")
