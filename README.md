# Report Studio

SaaS self-service para transformar planilhas em relatórios HTML profissionais.
O sistema recebe dados em `XLSX` ou `CSV`, permite configurar métricas, gráficos e layout no navegador, persiste o relatório no backend e exporta o resultado em HTML para compartilhamento ou uso interno.

## Visão Geral

O produto foi desenhado para dois objetivos ao mesmo tempo:

- dar autonomia para o usuário montar relatórios sem depender de BI tradicional;
- sustentar um fluxo comercial com cobrança recorrente, limites por plano e upgrade guiado pelo uso.

Em termos práticos, o usuário:

1. cria conta ou faz login;
2. entra no dashboard;
3. carrega uma planilha;
4. configura a leitura das colunas e os blocos do relatório;
5. salva o estado no banco;
6. exporta um HTML final;
7. faz upgrade de plano quando atinge o limite.

## Stack

- Frontend: React 18, Vite, Tailwind, Motion, React Query, Zustand, Axios, ECharts, `xlsx`, PapaParse.
- Backend: FastAPI, SQLAlchemy async, PostgreSQL, Stripe, Resend.
- Infra: Docker Compose, Nginx, Redis, volumes persistentes.
- Testes: Playwright no frontend e `pytest` no backend.

## Arquitetura

```text
Usuário
  ↓
Nginx
  ├─ Frontend React/Vite
  └─ Backend FastAPI
        ├─ PostgreSQL
        ├─ Stripe
        ├─ Resend
        └─ Redis/infra de apoio
```

O Nginx funciona como reverse proxy na borda. O frontend entrega a interface SPA. O backend concentra autenticação, persistência, cálculo de métricas, cobrança e envio de emails.

## O Que O Sistema Faz

- autentica usuários com JWT;
- mantém cadastro de planos e limites por assinatura;
- salva relatórios por usuário;
- processa pré-visualização do relatório antes da exportação;
- calcula métricas e insights a partir dos dados carregados;
- exporta HTML final;
- integra checkout, portal e webhooks da Stripe;
- envia emails transacionais e leads comerciais;
- bloqueia operação quando o limite do plano é atingido.

## Fluxo Técnico De Ponta A Ponta

### 1. Inicialização

O ponto de entrada do backend é [`backend/app/main.py`](backend/app/main.py).

- cria a aplicação FastAPI;
- habilita gzip e CORS;
- registra os routers;
- inicializa as tabelas no startup;
- chama `ensure_schema` para compatibilização de schema;
- expõe `/api/health`, `/api/docs` e `/api/redoc`.

No frontend, o bootstrap ocorre em [`frontend/src/main.jsx`](frontend/src/main.jsx).

- aplica o tema salvo;
- sincroniza autenticação persistida;
- monta o `QueryClient`;
- renderiza a aplicação principal e o toaster de notificações.

### 2. Autenticação

O fluxo de auth fica em [`backend/app/routers/auth.py`](backend/app/routers/auth.py) e [`backend/app/core/auth.py`](backend/app/core/auth.py).

- registro cria usuário com senha hash `bcrypt`;
- login valida credenciais e emite JWT;
- `/api/auth/me` devolve o usuário autenticado;
- `get_current_user` valida o token e carrega o usuário no banco;
- o frontend persiste token e usuário em `localStorage` via [`frontend/src/store/authStore.js`](frontend/src/store/authStore.js);
- [`frontend/src/lib/api.js`](frontend/src/lib/api.js) injeta o Bearer token nas requisições;
- uma rotina de inatividade encerra a sessão após 10 minutos sem atividade em [`frontend/src/App.jsx`](frontend/src/App.jsx).

### 3. Entrada No Produto

As rotas do frontend são definidas em [`frontend/src/App.jsx`](frontend/src/App.jsx).

- `LandingPage` apresenta o produto;
- `PricingPage` mostra os planos;
- `LoginPage` e `RegisterPage` tratam entrada pública;
- `DashboardPage` lista relatórios;
- `EditorPage` concentra criação e edição;
- `BillingPage` e `BillingSuccessPage` tratam assinatura;
- `ProfilePage` mostra dados do usuário;
- `ContactPage` coleta leads comerciais.

### 4. Criação E Edição De Relatórios

O coração do produto está em [`frontend/src/pages/EditorPage.jsx`](frontend/src/pages/EditorPage.jsx).

Esse arquivo:

- recebe upload de planilha;
- mantém o estado completo do relatório;
- abre o assistente de configuração;
- envia pré-visualização para o backend;
- faz autosave do relatório;
- dispara exportação HTML;
- sincroniza o estado local com a resposta da API.

Os componentes de apoio ficam em:

- [`frontend/src/components/editor/UploadZone.jsx`](frontend/src/components/editor/UploadZone.jsx): upload por drag and drop;
- [`frontend/src/components/editor/SetupWizard.jsx`](frontend/src/components/editor/SetupWizard.jsx): detecção inicial de colunas e validação;
- [`frontend/src/components/editor/DataTable.jsx`](frontend/src/components/editor/DataTable.jsx): visualização e edição tabular;
- [`frontend/src/components/editor/LayoutPanel.jsx`](frontend/src/components/editor/LayoutPanel.jsx): layout, título, footer e aparência;
- [`frontend/src/components/editor/ChartsPanel.jsx`](frontend/src/components/editor/ChartsPanel.jsx): configuração dos gráficos;
- [`frontend/src/components/editor/ColumnsPanel.jsx`](frontend/src/components/editor/ColumnsPanel.jsx): visibilidade e mapeamento das colunas;
- [`frontend/src/components/editor/ReportPreview.jsx`](frontend/src/components/editor/ReportPreview.jsx): preview visual do relatório.

### 5. Validação E Pré-Visualização

O frontend calcula parte da preparação dos dados no navegador, mas valida a configuração no backend antes de salvar ou exportar.

- [`frontend/src/lib/saving.js`](frontend/src/lib/saving.js) detecta tipo de coluna e normaliza a configuração de métricas;
- [`backend/app/services/metrics_engine.py`](backend/app/services/metrics_engine.py) interpreta os dados recebidos, valida tipos e monta o dataset calculado;
- [`backend/app/routers/reports.py`](backend/app/routers/reports.py) expõe `/api/reports/preview` para pré-visualização.

Se a configuração estiver inconsistente, a API devolve erro de validação em nível de campo. Isso evita exportar um relatório quebrado.

### 6. Persistência

Os dados são persistidos via PostgreSQL usando SQLAlchemy async.

- [`backend/app/core/database.py`](backend/app/core/database.py) cria o engine e a sessão;
- [`backend/app/models/user.py`](backend/app/models/user.py) guarda identidade, plano e consumo;
- [`backend/app/models/report.py`](backend/app/models/report.py) guarda o relatório e seu JSON de configuração;
- [`backend/app/models/subscription.py`](backend/app/models/subscription.py) guarda o espelho da assinatura Stripe;
- [`backend/app/models/payment.py`](backend/app/models/payment.py) guarda pagamentos;
- [`backend/app/routers/reports.py`](backend/app/routers/reports.py) faz CRUD de relatórios;
- o campo `config` do relatório guarda o estado completo do editor.

### 7. Exportação

A exportação é feita em dois pontos:

- o backend valida limites, incrementa uso e prepara o payload de exportação;
- o frontend monta o HTML final em [`frontend/src/lib/reportExport.jsx`](frontend/src/lib/reportExport.jsx).

O fluxo é:

1. o usuário clica em exportar;
2. o frontend salva o estado atual;
3. a API em [`backend/app/routers/reports.py`](backend/app/routers/reports.py) verifica limite do plano com [`backend/app/middleware/plan_limit.py`](backend/app/middleware/plan_limit.py);
4. a exportação incrementa contadores de uso;
5. o frontend recebe o dataset final;
6. [`buildReportHTML`](frontend/src/lib/reportExport.jsx) gera o HTML em memória;
7. o navegador baixa o arquivo `.html`.

### 8. Cobrança E Planos

O módulo comercial vive em [`backend/app/core/plans.py`](backend/app/core/plans.py), [`backend/app/services/stripe_service.py`](backend/app/services/stripe_service.py), [`backend/app/routers/billing_routes.py`](backend/app/routers/billing_routes.py) e [`backend/app/routers/plans.py`](backend/app/routers/plans.py).

- `plans.py` define o catálogo de planos e segmentação;
- `stripe_service.py` resolve `price_id`, cria clientes, checkout e portal;
- `billing_routes.py` monta os endpoints de checkout, confirmação, upgrade/downgrade e webhooks;
- `plans.py` expõe a lista pública de planos;
- `User.plan_limit` em [`backend/app/models/user.py`](backend/app/models/user.py) aplica o limite real no backend.

Quando uma assinatura muda:

1. a Stripe envia webhook;
2. o backend valida a assinatura do evento;
3. o usuário tem plano, preço e período atualizados;
4. os limites passam a refletir o novo plano;
5. o frontend mostra o estado sincronizado.

### 9. Emails E Lead Comercial

Os emails são enviados por Resend via [`backend/app/services/email_service.py`](backend/app/services/email_service.py).

- [`backend/app/services/email_events.py`](backend/app/services/email_events.py) dispara eventos como boas-vindas, pagamento aprovado, pagamento falho, relatório pronto e limite atingido;
- [`backend/app/routers/contact.py`](backend/app/routers/contact.py) recebe leads comerciais e envia para o email configurado em `CONTACT_EMAIL`.

### 10. Navegação E UX

O shell visual principal está em:

- [`frontend/src/components/layout/Navbar.jsx`](frontend/src/components/layout/Navbar.jsx);
- [`frontend/src/components/InsightsPanel.jsx`](frontend/src/components/InsightsPanel.jsx);
- [`frontend/src/components/billing/EmbeddedCheckoutModal.jsx`](frontend/src/components/billing/EmbeddedCheckoutModal.jsx).

O estado de tema fica em [`frontend/src/store/themeStore.js`](frontend/src/store/themeStore.js).

## Fluxo Comercial De Ponta A Ponta

O produto foi desenhado como uma escada de conversão:

1. a landing page atrai tráfego e apresenta o valor do produto;
2. o usuário testa o plano gratuito;
3. limites de uso criam um gatilho natural de upgrade;
4. planos self-service convertem sem intervenção humana;
5. planos empresariais direcionam para contato comercial;
6. o portal Stripe permite gestão pós-venda.

### Posicionamento

- foco em times de compras, procurement e operação;
- proposta central: sair do Excel bruto para um relatório profissional em poucos minutos;
- ticket de entrada baixo para reduzir fricção;
- oferta empresarial para contas com mais volume e necessidade de suporte.

### Catálogo Comercial

O catálogo oficial de planos fica em [`backend/app/core/plans.py`](backend/app/core/plans.py).

- `free`: entrada sem custo, ideal para aquisição;
- `individual_lite`: plano self-service de baixo custo;
- `individual_pro`: plano principal de conversão;
- `individual_plus`: plano self-service acima do Pro;
- `team`: oferta para empresa com onboarding assistido;
- `business_plus`: camada corporativa acima do Team;
- `enterprise`: contrato sob medida.

O README e a interface comercial podem apresentar esses nomes com a linguagem de mercado do site, mas o mapa técnico sempre parte desse catálogo central.

### Como O Sistema Gera Receita

- o plano gratuito reduz barreira de entrada;
- o limite por mês aumenta chance de conversão;
- Stripe mantém assinatura recorrente;
- o backend bloqueia uso acima do plano;
- o email de limite atingido reforça o upsell;
- o contact form alimenta vendas consultivas.

## Mapa De Arquivos

### Raiz

- [`docker-compose.yml`](docker-compose.yml): sobe PostgreSQL, Redis, backend, frontend e Nginx.
- [`Makefile`](Makefile): atalhos operacionais para subir, derrubar, logar, resetar e abrir shells.
- [`nginx/nginx.conf`](nginx/nginx.conf): proxy reverso e regras de borda.
- [`backend/init.sql`](backend/init.sql): inicialização de banco.
- [`INSIGHTS_ENGINE_EXECUTION_PLAN.md`](INSIGHTS_ENGINE_EXECUTION_PLAN.md): documento auxiliar de execução da engine de insights.
- [`patch_datatable.py`](patch_datatable.py), [`patch_preview_filters.py`](patch_preview_filters.py), [`patch_header.py`](patch_header.py): utilitários de ajuste pontual.
- [`send_test_email.py`](send_test_email.py): script auxiliar para teste de email.

### Backend

#### Entrada e infraestrutura

- [`backend/app/main.py`](backend/app/main.py): aplicação FastAPI, CORS, rotas, startup e healthcheck.
- [`backend/app/core/config.py`](backend/app/core/config.py): leitura de `.env`, URLs, segredos, limites de plano e CORS.
- [`backend/app/core/database.py`](backend/app/core/database.py): engine async e sessão.
- [`backend/app/core/auth.py`](backend/app/core/auth.py): hash de senha, JWT e dependência de usuário atual.
- [`backend/app/core/background.py`](backend/app/core/background.py): execução de corrotinas em background.
- [`backend/app/core/plans.py`](backend/app/core/plans.py): catálogo de planos e serialização.
- [`backend/app/core/schema.py`](backend/app/core/schema.py): compatibilização de schema em runtime.

#### Modelos

- [`backend/app/models/user.py`](backend/app/models/user.py): usuário, plano, uso mensal, relacionamento com relatórios, assinaturas e pagamentos.
- [`backend/app/models/report.py`](backend/app/models/report.py): relatório, config JSON, contadores e timestamps.
- [`backend/app/models/subscription.py`](backend/app/models/subscription.py): espelho local da assinatura Stripe.
- [`backend/app/models/payment.py`](backend/app/models/payment.py): registro de pagamentos.

#### Rotas

- [`backend/app/routers/auth.py`](backend/app/routers/auth.py): registro, login, `/me`.
- [`backend/app/routers/reports.py`](backend/app/routers/reports.py): CRUD de relatórios, preview, exportação e controle de cota.
- [`backend/app/routers/plans.py`](backend/app/routers/plans.py): lista pública de planos.
- [`backend/app/routers/contact.py`](backend/app/routers/contact.py): lead comercial e envio de email.
- [`backend/app/routers/billing_routes.py`](backend/app/routers/billing_routes.py): checkout, portal, confirmação de assinatura e webhooks.
- [`backend/app/routers/billing.py`](backend/app/routers/billing.py): implementação alternativa/legada do fluxo de billing, não montada diretamente em [`main.py`](backend/app/main.py).

#### Serviços

- [`backend/app/services/metrics_engine.py`](backend/app/services/metrics_engine.py): normalização, validação e geração de dataset calculado.
- [`backend/app/services/insights_engine.py`](backend/app/services/insights_engine.py): regras de insight e sinais analíticos.
- [`backend/app/services/stripe_service.py`](backend/app/services/stripe_service.py): integração com Stripe, checkout, portal e sincronização de assinatura.
- [`backend/app/services/email_service.py`](backend/app/services/email_service.py): envio via Resend.
- [`backend/app/services/email_events.py`](backend/app/services/email_events.py): mensagens transacionais disparadas por eventos do sistema.

#### Testes

- [`backend/tests/test_metrics_engine.py`](backend/tests/test_metrics_engine.py): valida o motor de métricas.
- [`backend/tests/test_insights_engine.py`](backend/tests/test_insights_engine.py): valida geração de insights.
- [`backend/tests/test_reports_insights_integration.py`](backend/tests/test_reports_insights_integration.py): integração entre relatórios e insights.

### Frontend

#### Entrada e estado

- [`frontend/src/main.jsx`](frontend/src/main.jsx): bootstrap da aplicação React.
- [`frontend/src/App.jsx`](frontend/src/App.jsx): rotas, proteção de páginas e expiração de sessão.
- [`frontend/src/lib/api.js`](frontend/src/lib/api.js): cliente Axios com JWT e tratamento de 401.
- [`frontend/src/store/authStore.js`](frontend/src/store/authStore.js): persistência de autenticação com Zustand.
- [`frontend/src/store/themeStore.js`](frontend/src/store/themeStore.js): tema visual persistido.

#### Lógica de domínio

- [`frontend/src/lib/saving.js`](frontend/src/lib/saving.js): normalização e validação da configuração de métricas.
- [`frontend/src/lib/reportExport.jsx`](frontend/src/lib/reportExport.jsx): geração do HTML exportado.
- [`frontend/src/lib/appUrl.js`](frontend/src/lib/appUrl.js): utilitários de URL da aplicação.

#### Páginas

- [`frontend/src/pages/LandingPage.jsx`](frontend/src/pages/LandingPage.jsx): vitrine comercial.
- [`frontend/src/pages/PricingPage.jsx`](frontend/src/pages/PricingPage.jsx): comparação de planos.
- [`frontend/src/pages/LoginPage.jsx`](frontend/src/pages/LoginPage.jsx): autenticação.
- [`frontend/src/pages/RegisterPage.jsx`](frontend/src/pages/RegisterPage.jsx): cadastro.
- [`frontend/src/pages/DashboardPage.jsx`](frontend/src/pages/DashboardPage.jsx): lista e acesso a relatórios.
- [`frontend/src/pages/EditorPage.jsx`](frontend/src/pages/EditorPage.jsx): criação, edição, salvamento e exportação.
- [`frontend/src/pages/BillingPage.jsx`](frontend/src/pages/BillingPage.jsx): gestão de cobrança.
- [`frontend/src/pages/BillingSuccessPage.jsx`](frontend/src/pages/BillingSuccessPage.jsx): retorno de checkout.
- [`frontend/src/pages/ProfilePage.jsx`](frontend/src/pages/ProfilePage.jsx): dados do usuário e assinatura.
- [`frontend/src/pages/ContactPage.jsx`](frontend/src/pages/ContactPage.jsx): formulário de contato.

#### Componentes

- [`frontend/src/components/layout/Navbar.jsx`](frontend/src/components/layout/Navbar.jsx): navegação global.
- [`frontend/src/components/InsightsPanel.jsx`](frontend/src/components/InsightsPanel.jsx): visualização dos insights.
- [`frontend/src/components/editor/UploadZone.jsx`](frontend/src/components/editor/UploadZone.jsx): upload de arquivo.
- [`frontend/src/components/editor/SetupWizard.jsx`](frontend/src/components/editor/SetupWizard.jsx): wizard de configuração inicial.
- [`frontend/src/components/editor/DataTable.jsx`](frontend/src/components/editor/DataTable.jsx): tabela de dados.
- [`frontend/src/components/editor/LayoutPanel.jsx`](frontend/src/components/editor/LayoutPanel.jsx): ajustes visuais.
- [`frontend/src/components/editor/ChartsPanel.jsx`](frontend/src/components/editor/ChartsPanel.jsx): configuração de gráficos.
- [`frontend/src/components/editor/ColumnsPanel.jsx`](frontend/src/components/editor/ColumnsPanel.jsx): configuração de colunas.
- [`frontend/src/components/editor/ReportPreview.jsx`](frontend/src/components/editor/ReportPreview.jsx): preview renderizado.
- [`frontend/src/components/billing/EmbeddedCheckoutModal.jsx`](frontend/src/components/billing/EmbeddedCheckoutModal.jsx): fluxo embutido de checkout.

#### Testes

- [`frontend/tests/export-parity.spec.js`](frontend/tests/export-parity.spec.js): garante paridade entre preview e exportação.

## Variáveis De Ambiente

O arquivo `.env` é lido por [`backend/app/core/config.py`](backend/app/core/config.py).

### Núcleo

- `SECRET_KEY`: segredo do JWT.
- `APP_URL`: URL pública da aplicação.
- `DATABASE_URL`: URL do PostgreSQL.
- `DB_PASSWORD`: senha padrão do banco quando `DATABASE_URL` não é definida.
- `REDIS_URL`: URL do Redis.
- `REDIS_PASSWORD`: senha do Redis.
- `CORS_ORIGINS`: lista de origens permitidas.

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLIC_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_BUSINESS`
- `STRIPE_PRICE_INDIVIDUAL_LITE`
- `STRIPE_PRICE_INDIVIDUAL_PRO`
- `STRIPE_PRICE_INDIVIDUAL_PLUS`

### Email

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CONTACT_EMAIL`

### Limites

Os limites do plano ficam definidos no código de configuração:

- Free: 3 relatórios
- Starter: 8 relatórios
- Pro: 30 relatórios
- Business: 80 relatórios

## Executar Localmente Com Docker

### Pré-requisitos

- Docker 24+;
- Docker Compose 2.20+;
- Git.

### Subida

```bash
docker compose up -d --build
```

### Acessos

- Aplicação: `http://localhost`
- API docs: `http://localhost:8000/api/docs`
- Redoc: `http://localhost:8000/api/redoc`

### Comandos úteis

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend
docker compose exec backend bash
docker compose exec db psql -U rs_user -d reportstudio
docker compose down
docker compose down -v
make up
make down
make logs
make reset
make shell-db
```

## Desenvolvimento Sem Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL="postgresql+asyncpg://rs_user:rs_secret@localhost:5432/reportstudio"
export REDIS_URL="redis://:rs_redis_2025@localhost:6379/0"
export SECRET_KEY="dev_secret_key"

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

O Vite sobe em `http://localhost:3000` e faz proxy de `/api` para `http://localhost:8000`.

## Fluxo De Execução Resumido

```text
login/register
  ↓
dashboard
  ↓
upload da planilha
  ↓
wizard detecta colunas
  ↓
preview via /api/reports/preview
  ↓
autosave em /api/reports
  ↓
exportação HTML em /api/reports/{id}/export
  ↓
Stripe billing quando há upgrade
```

## Observações De Produção

- O banco é PostgreSQL com volume persistente.
- O frontend é servido atrás do Nginx.
- O backend valida assinatura do webhook da Stripe.
- O controle de cota é feito no servidor, não só na interface.
- O contato comercial cai em `CONTACT_EMAIL` via Resend.

## Testes

```bash
cd backend
pytest

cd ../frontend
npm run test:export:snapshots
```

## Suporte

Abra uma issue no repositório ou use o email configurado em `EMAIL_FROM`.
