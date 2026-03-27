from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PlanCatalogItem:
    id: str
    name: str
    segment: str  # individual | company
    price_brl: int
    price_usd: int
    reports_per_month: int
    included_users: int
    extra_user_price_brl: Optional[int]
    features: list[str]
    cta: str
    highlighted: bool
    self_service: bool
    current_plan_ids: list[str]


PLANS_CATALOG: list[PlanCatalogItem] = [
    PlanCatalogItem(
        id="free",
        name="Gratuito",
        segment="individual",
        price_brl=0,
        price_usd=0,
        reports_per_month=3,
        included_users=1,
        extra_user_price_brl=None,
        features=[
            "3 relatórios / mês",
            "Upload de XLSX e CSV",
            "Exportação HTML",
            "Suporte comunidade",
        ],
        cta="Começar grátis",
        highlighted=False,
        self_service=False,
        current_plan_ids=["free"],
    ),
    PlanCatalogItem(
        id="individual_lite",
        name="Individual Lite",
        segment="individual",
        price_brl=15,
        price_usd=3,
        reports_per_month=8,
        included_users=1,
        extra_user_price_brl=None,
        features=[
            "8 relatórios / mês",
            "1 dashboard",
            "Exportação padrão",
            "Suporte por email",
        ],
        cta="Assinar Lite",
        highlighted=False,
        self_service=True,
        current_plan_ids=["starter"],
    ),
    PlanCatalogItem(
        id="individual_pro",
        name="Individual Pro",
        segment="individual",
        price_brl=29,
        price_usd=6,
        reports_per_month=30,
        included_users=1,
        extra_user_price_brl=None,
        features=[
            "30 relatórios / mês",
            "Até 3 dashboards",
            "Agendamento simples",
            "Filtros avançados",
            "Suporte em até 24h",
        ],
        cta="Assinar Pro",
        highlighted=True,
        self_service=True,
        current_plan_ids=["pro"],
    ),
    PlanCatalogItem(
        id="individual_plus",
        name="Individual Plus",
        segment="individual",
        price_brl=49,
        price_usd=10,
        reports_per_month=80,
        included_users=1,
        extra_user_price_brl=None,
        features=[
            "80 relatórios / mês",
            "Dashboards ilimitados",
            "Exportação avançada",
            "Prioridade no suporte",
        ],
        cta="Assinar Plus",
        highlighted=False,
        self_service=True,
        current_plan_ids=["business"],
    ),
    PlanCatalogItem(
        id="team",
        name="Empresarial Team",
        segment="company",
        price_brl=169,
        price_usd=34,
        reports_per_month=300,
        included_users=5,
        extra_user_price_brl=25,
        features=[
            "5 usuários inclusos",
            "300 relatórios / mês",
            "Permissões por perfil",
            "Onboarding assistido",
        ],
        cta="Falar com vendas",
        highlighted=False,
        self_service=False,
        current_plan_ids=[],
    ),
    PlanCatalogItem(
        id="business_plus",
        name="Empresarial Business",
        segment="company",
        price_brl=329,
        price_usd=66,
        reports_per_month=900,
        included_users=15,
        extra_user_price_brl=20,
        features=[
            "15 usuários inclusos",
            "900 relatórios / mês",
            "Auditoria e gestão avançada",
            "SLA comercial",
        ],
        cta="Falar com vendas",
        highlighted=False,
        self_service=False,
        current_plan_ids=[],
    ),
    PlanCatalogItem(
        id="enterprise",
        name="Enterprise",
        segment="company",
        price_brl=1200,
        price_usd=240,
        reports_per_month=9999,
        included_users=50,
        extra_user_price_brl=None,
        features=[
            "Volume sob contrato",
            "SSO e white-label",
            "Compliance e segurança avançada",
            "Suporte dedicado",
        ],
        cta="Solicitar proposta",
        highlighted=False,
        self_service=False,
        current_plan_ids=[],
    ),
]


def serialize_plan(plan: PlanCatalogItem) -> dict:
    stripe_price_id = None
    if plan.self_service:
        from app.services.stripe_service import get_price_id_for_plan
        stripe_price_id = get_price_id_for_plan(plan.id)

    return {
        "id": plan.id,
        "name": plan.name,
        "segment": plan.segment,
        "price_brl": plan.price_brl,
        "price_usd": plan.price_usd,
        "reports_per_month": plan.reports_per_month,
        "included_users": plan.included_users,
        "extra_user_price_brl": plan.extra_user_price_brl,
        "features": plan.features,
        "cta": plan.cta,
        "highlighted": plan.highlighted,
        "self_service": plan.self_service,
        "current_plan_ids": plan.current_plan_ids,
        "stripe_price_id": stripe_price_id,
    }
