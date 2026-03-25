import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)


def run_async_task(coro: Coroutine[Any, Any, Any]) -> None:
    try:
        task = asyncio.create_task(coro)
        task.add_done_callback(_log_task_result)
    except Exception:
        logger.exception("Falha ao agendar tarefa assincrona em background.")


def _log_task_result(task: asyncio.Task[Any]) -> None:
    try:
        task.result()
    except Exception:
        logger.exception("Falha em tarefa assincrona executada em background.")
