# Plano de Execucao - Insights Engine

## Ajuste do plano para a arquitetura real do projeto

No estado atual do sistema:

- o upload e a estruturacao inicial dos dados acontecem no frontend
- o backend persiste o relatorio em `report.config`
- o preview e o HTML exportado sao gerados no frontend
- o tema do relatorio nao e fixo: o usuario escolhe entre claro, escuro ou seguir o tema atual no fluxo de exportacao

Por isso, a implementacao sera adaptada assim:

1. O backend passa a gerar insights a partir de `config.cols` + `config.rows`
2. O resultado e salvo dentro de `config.insights` e `config.insightsMeta`
3. O frontend apenas renderiza o que veio salvo no relatorio
4. O preview e o HTML exportado continuam respeitando o tema escolhido pelo usuario

## Conflito identificado no prompt original

Existe uma contradicao entre:

- Regra 8: dataset vazio deve gerar insight de severidade alta
- Teste minimo 1: `data = []` deveria retornar lista vazia

Decisao adotada para o desenvolvimento:

- seguir a regra de negocio principal
- `data = []` retornara um insight informando que o dataset e vazio ou insuficiente

## Fases de execucao

### Fase 1 - Nucleo do backend

- criar `backend/app/services/insights_engine.py`
- implementar alias map, thresholds, normalizacao e regras
- garantir fallback seguro em erro
- adicionar testes unitarios minimos

### Fase 2 - Integracao no save/update do relatorio

- adaptar `backend/app/routers/reports.py`
- converter `config.cols` + `config.rows` em `list[dict]`
- recalcular insights no create/update
- salvar insights dentro de `config`

### Fase 3 - Preview no frontend

- criar `frontend/src/components/InsightsPanel.jsx`
- integrar no `ReportPreview.jsx`
- posicionar insights apos o header e antes do banner de saving

### Fase 4 - Export HTML

- adaptar `frontend/src/lib/reportExport.js`
- renderizar insights no HTML exportado
- manter compatibilidade com o tema selecionado pelo usuario no export

### Fase 5 - Validacao funcional

- validar aliases reais como `Conformidade` e `Saving (%)`
- validar ordenacao e deduplicacao
- validar export com tema claro e escuro
- validar comportamento com datasets sem campos compativeis
