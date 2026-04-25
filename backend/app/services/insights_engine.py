from collections import Counter
from datetime import datetime, timezone
import logging


logger = logging.getLogger(__name__)


FIELD_ALIASES = {
    "saving_percent": [
        "saving (%)", "saving(%)", "saving_percent", "saving", "economia",
        "saving_pct", "pct_saving",
    ],
    "metric_value": [
        "metric_value", "valor_metrica", "valor métrica", "saving_calculado",
    ],
    "valor_pago": [
        "valor pago", "valor_pago", "valor", "amount", "vl_pago",
        "valor negociado", "valor_negociado",
    ],
    "fornecedor": [
        "fornecedor", "supplier", "vendor", "fornecedor/empresa",
        "empresa", "razao_social", "razao social", "razão social",
    ],
    "conformidade": [
        "conformidade", "conforme", "compliance", "status_conformidade",
    ],
    "score": [
        "score", "score fornecedor", "score_fornecedor", "avaliacao",
        "avaliação", "nota", "rating", "performance",
    ],
    "valor_estimado": [
        "valor estimado", "valor_estimado", "vl_estimado", "budget",
    ],
    "status": [
        "status", "situacao", "situação", "estado",
    ],
    "categoria": [
        "categoria", "category", "tipo", "tipo serviço", "tipo servico", "tipo_servico",
    ],
}


THRESHOLDS = {
    "saving_minimo": 10.0,
    "concentracao_fornecedor": 0.30,
    "concentracao_categoria": 0.40,
    "nao_conformidade_maxima": 0.50,
    "outlier_fator": 2.0,
    "performance_minima": 7.0,
    "min_baixa_performance_pct": 0.20,
    "cancelados_maxima": 0.15,
    "max_insights_exibidos": 5,
}


SEVERITY_ORDER = {"alta": 0, "media": 1, "baixa": 2}


def _normalize_key(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _normalize_text(value) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _resolve_field(keys: list[str], aliases: dict) -> str | None:
    normalized_keys = {_normalize_key(key): key for key in keys}
    for alias in aliases:
        normalized_alias = _normalize_key(alias)
        if normalized_alias in normalized_keys:
            return normalized_keys[normalized_alias]
    return None


def _to_float(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    for token in ("R$", "$", "€", "£", "%"):
        text = text.replace(token, "")
    text = text.replace(" ", "")

    if not text:
        return None

    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        if len(parts[-1]) <= 2:
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif text.count(".") > 1:
        text = text.replace(".", "")

    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _format_pct(value: float) -> str:
    return f"{value:.1f}%".replace(".", ",")


def _build_meta(record_count: int, insights_count: int) -> dict:
    return {
        "record_count": record_count,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "insights_count": insights_count,
    }


def _rule_dataset_insuficiente(data: list[dict], fields: dict) -> dict | None:
    try:
        if len(data) == 0:
            logger.info("Regra dataset vazio disparada: total_registros=0")
            return {
                "tipo": "operacional",
                "severidade": "alta",
                "titulo": "Dataset vazio ou insuficiente",
                "descricao": "O dataset analisado possui 0 registros válidos. É necessário carregar dados antes de gerar conclusões.",
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra dataset_insuficiente")
        return None


def _rule_saving_baixo(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("saving_percent")
        if not field_name:
            logger.info("Regra saving baixo pulada: campo saving_percent nao encontrado")
            return None

        values = []
        for row in data:
            number = _to_float(row.get(field_name))
            if number is not None:
                values.append(number)

        if not values:
            return None

        average = sum(values) / len(values)
        if average < THRESHOLDS["saving_minimo"]:
            logger.info("Regra saving baixo disparada: media=%s", average)
            return {
                "tipo": "financeiro",
                "severidade": "alta",
                "titulo": "Saving médio abaixo do benchmark",
                "descricao": (
                    f"Saving médio atual: {_format_pct(average)}. "
                    f"Benchmark de referência: {_format_pct(THRESHOLDS['saving_minimo'])}. "
                    "Recomenda-se revisar negociações e alavancas de economia."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra saving_baixo")
        return None


def _rule_concentracao_fornecedor(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("fornecedor")
        if not field_name:
            logger.info("Regra concentracao fornecedor pulada: campo fornecedor nao encontrado")
            return None

        values = [_normalize_text(row.get(field_name)) for row in data]
        values = [value for value in values if value]
        if not values:
            return None

        counter = Counter(values)
        top_name, top_count = counter.most_common(1)[0]
        percentage = top_count / len(values)
        if percentage > THRESHOLDS["concentracao_fornecedor"]:
            logger.info(
                "Regra concentracao fornecedor disparada: fornecedor=%s percentual=%s",
                top_name,
                percentage,
            )
            return {
                "tipo": "risco",
                "severidade": "alta",
                "titulo": "Alta concentração em fornecedor",
                "descricao": (
                    f"O fornecedor mais recorrente é '{top_name}' e representa {_format_pct(percentage * 100)} "
                    f"dos registros analisados. O limite de atenção definido é {_format_pct(THRESHOLDS['concentracao_fornecedor'] * 100)}."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra concentracao_fornecedor")
        return None


def _rule_nao_conformidade(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("conformidade")
        if not field_name:
            logger.info("Regra nao conformidade pulada: campo conformidade nao encontrado")
            return None

        invalid_count = 0
        total = 0
        for row in data:
            normalized = _normalize_text(row.get(field_name))
            if not normalized:
                continue
            total += 1
            if normalized in {"não", "nao"}:
                invalid_count += 1

        if total == 0:
            return None

        percentage = invalid_count / total
        if percentage > THRESHOLDS["nao_conformidade_maxima"]:
            logger.info(
                "Regra nao conformidade disparada: quantidade=%s percentual=%s",
                invalid_count,
                percentage,
            )
            return {
                "tipo": "risco",
                "severidade": "alta",
                "titulo": "Não conformidade acima do limite",
                "descricao": (
                    f"Foram identificados {invalid_count} registros com status 'Não', "
                    f"equivalentes a {_format_pct(percentage * 100)} do total válido. "
                    f"O limite configurado é {_format_pct(THRESHOLDS['nao_conformidade_maxima'] * 100)}."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra nao_conformidade")
        return None


def _rule_outliers_financeiros(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("valor_pago")
        if not field_name:
            logger.info("Regra outliers financeiros pulada: campo valor_pago nao encontrado")
            return None

        values = []
        for row in data:
            number = _to_float(row.get(field_name))
            if number is not None and number > 0:
                values.append(number)

        if not values:
            return None

        average = sum(values) / len(values)
        limit = average * THRESHOLDS["outlier_fator"]
        outliers = [value for value in values if value > limit]
        if outliers:
            logger.info(
                "Regra outliers financeiros disparada: quantidade=%s media=%s limite=%s",
                len(outliers),
                average,
                limit,
            )
            return {
                "tipo": "financeiro",
                "severidade": "media",
                "titulo": "Outliers financeiros identificados",
                "descricao": (
                    f"Foram encontrados {len(outliers)} registros acima de 2x a média. "
                    f"Média calculada: {average:.2f}. Limiar de outlier: {limit:.2f}."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra outliers_financeiros")
        return None


def _rule_baixa_performance(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("score")
        if not field_name:
            logger.info("Regra baixa performance pulada: campo score nao encontrado")
            return None

        valid_scores = []
        for row in data:
            number = _to_float(row.get(field_name))
            if number is not None:
                valid_scores.append(number)

        if not valid_scores:
            return None

        low_scores = [score for score in valid_scores if score < THRESHOLDS["performance_minima"]]
        percentage = len(low_scores) / len(valid_scores)
        if percentage > THRESHOLDS["min_baixa_performance_pct"]:
            logger.info(
                "Regra baixa performance disparada: quantidade=%s percentual=%s",
                len(low_scores),
                percentage,
            )
            return {
                "tipo": "operacional",
                "severidade": "media",
                "titulo": "Performance de fornecedores abaixo do ideal",
                "descricao": (
                    f"Foram identificados {len(low_scores)} registros com score abaixo de {THRESHOLDS['performance_minima']:.1f}, "
                    f"equivalentes a {_format_pct(percentage * 100)} dos scores válidos."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra baixa_performance")
        return None


def _rule_cancelados(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("status")
        if not field_name:
            logger.info("Regra cancelados pulada: campo status nao encontrado")
            return None

        total = 0
        canceled = 0
        for row in data:
            normalized = _normalize_text(row.get(field_name))
            if not normalized:
                continue
            total += 1
            if "cancelado" in normalized:
                canceled += 1

        if total == 0:
            return None

        percentage = canceled / total
        if percentage > THRESHOLDS["cancelados_maxima"]:
            logger.info(
                "Regra cancelados disparada: quantidade=%s percentual=%s",
                canceled,
                percentage,
            )
            return {
                "tipo": "operacional",
                "severidade": "media",
                "titulo": "Cancelamentos acima do esperado",
                "descricao": (
                    f"Foram encontrados {canceled} registros com status cancelado, "
                    f"equivalentes a {_format_pct(percentage * 100)} do total válido. "
                    f"O limite de atenção é {_format_pct(THRESHOLDS['cancelados_maxima'] * 100)}."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra cancelados")
        return None


def _rule_concentracao_categoria(data: list[dict], fields: dict) -> dict | None:
    try:
        field_name = fields.get("categoria")
        if not field_name:
            logger.info("Regra concentracao categoria pulada: campo categoria nao encontrado")
            return None

        values = [_normalize_text(row.get(field_name)) for row in data]
        values = [value for value in values if value]
        if not values:
            return None

        counter = Counter(values)
        top_name, top_count = counter.most_common(1)[0]
        percentage = top_count / len(values)
        if percentage > THRESHOLDS["concentracao_categoria"]:
            logger.info(
                "Regra concentracao categoria disparada: categoria=%s percentual=%s",
                top_name,
                percentage,
            )
            return {
                "tipo": "operacional",
                "severidade": "baixa",
                "titulo": "Categoria com alta concentração",
                "descricao": (
                    f"A categoria '{top_name}' representa {_format_pct(percentage * 100)} dos registros analisados. "
                    f"O limite configurado para concentração é {_format_pct(THRESHOLDS['concentracao_categoria'] * 100)}."
                ),
            }
        return None
    except Exception:
        logger.exception("Erro ao avaliar regra concentracao_categoria")
        return None


RULES = [
    _rule_dataset_insuficiente,
    _rule_saving_baixo,
    _rule_concentracao_fornecedor,
    _rule_nao_conformidade,
    _rule_outliers_financeiros,
    _rule_baixa_performance,
    _rule_cancelados,
    _rule_concentracao_categoria,
]


def generate_insights(data: list[dict]) -> dict:
    safe_data = data or []

    try:
        if not safe_data:
            insights = []
            dataset_insight = _rule_dataset_insuficiente(safe_data, {})
            if dataset_insight:
                insights.append(dataset_insight)
            return {
                "insights": insights,
                "meta": _build_meta(len(safe_data), len(insights)),
            }

        keys = list(safe_data[0].keys())
        fields = {}
        for canonical_name, aliases in FIELD_ALIASES.items():
            resolved = _resolve_field(keys, aliases)
            if resolved:
                logger.info("Campo resolvido: %s -> %s", canonical_name, resolved)
                fields[canonical_name] = resolved
            else:
                logger.info("Campo nao encontrado para alias map: %s", canonical_name)

        raw_insights = []
        for rule in RULES[1:]:
            insight = rule(safe_data, fields)
            if insight:
                raw_insights.append(insight)

        deduplicated = []
        seen_titles = set()
        for insight in raw_insights:
            title = insight.get("titulo", "").strip()
            if title and title not in seen_titles:
                deduplicated.append(insight)
                seen_titles.add(title)

        ordered = sorted(
            deduplicated,
            key=lambda item: (
                SEVERITY_ORDER.get(item.get("severidade", "baixa"), 99),
                item.get("titulo", ""),
            ),
        )
        limited = ordered[: THRESHOLDS["max_insights_exibidos"]]
        return {
            "insights": limited,
            "meta": _build_meta(len(safe_data), len(limited)),
        }
    except Exception:
        logger.exception("Falha geral ao gerar insights")
        return {
            "insights": [],
            "meta": _build_meta(len(safe_data), 0),
        }


# TODO: O template HTML exibe a coluna "Saving (%)" formatada como moeda BRL
# (ex: "R$ 6.901,22") mas o valor real é um percentual puro (ex: "11.76").
# Isso é um bug de formatacao no template de exportacao - nao afeta o engine
# de insights que le o valor numerico diretamente do dict de dados.
# Corrigir no template HTML separadamente, trocando fmtBRL() por fmtPct()
# para a coluna de saving percentual.
