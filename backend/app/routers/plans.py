from fastapi import APIRouter
from app.core.plans import PLANS_CATALOG, serialize_plan

router = APIRouter()

@router.get("/")
async def get_plans():
    return [serialize_plan(plan) for plan in PLANS_CATALOG]
