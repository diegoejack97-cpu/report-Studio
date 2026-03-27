import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)


def run_async_task(coro: Coroutine[Any, Any, Any]) -> None:
    try:
        asyncio.run(coro)
    except Exception:
        logger.exception("Falha ao agendar tarefa assincrona em background.")
