from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.core.schema import ensure_schema
from app.routers import auth, users, reports, plans, contact
from app.routers import billing_routes as billing

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_resend_api_key_diagnostics() -> dict[str, int | bool]:
    """
    Lê a variável diretamente do ambiente para diagnosticar se o processo
    realmente recebeu a chave, sem expor o valor.
    """
    resend_api_key = os.getenv("RESEND_API_KEY", "")
    resend_api_key_exists = bool(resend_api_key)
    resend_api_key_length = len(resend_api_key)

    return {
        "resend_api_key_exists": resend_api_key_exists,
        "resend_api_key_length": resend_api_key_length,
    }


def log_resend_api_key_diagnostics() -> None:
    diagnostics = get_resend_api_key_diagnostics()

    logger.info("RESEND_API_KEY exists: %s", diagnostics["resend_api_key_exists"])
    logger.info("RESEND_API_KEY length: %s", diagnostics["resend_api_key_length"])

    if not diagnostics["resend_api_key_exists"]:
        logger.error("RESEND_API_KEY não encontrada no ambiente")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Report Flow API starting...")
    log_resend_api_key_diagnostics()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_schema(engine)
    logger.info("Database tables ready")
    yield
    await engine.dispose()

app = FastAPI(
    title="Report Flow API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,    prefix="/api/auth",    tags=["Auth"])
app.include_router(users.router,   prefix="/api/users",   tags=["Users"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(billing.router, prefix="/api/billing", tags=["Billing"])
app.include_router(billing.webhook_router, tags=["Stripe Webhooks"])
app.include_router(plans.router,   prefix="/api/plans",   tags=["Plans"])
app.include_router(contact.router)

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/debug/env")
async def debug_env():
    return get_resend_api_key_diagnostics()
