# ✦ Report Studio — SaaS de Relatórios HTML

Editor self-service para criar relatórios profissionais a partir de arquivos Excel/CSV.
Stack: **React 18 + Tailwind + Motion** · **FastAPI + PostgreSQL + Redis** · **Docker Compose** · **Stripe**

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx :80                          │
│           (reverse proxy + rate limiting)               │
└────────────┬──────────────────────┬────────────────────-┘
             │                      │
     ┌───────▼──────┐      ┌────────▼──────┐
     │   Frontend   │      │   Backend     │
     │  React/Vite  │      │   FastAPI     │
     │   :80 (SPA)  │      │   :8000       │
     └──────────────┘      └──────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
             ┌──────▼────┐  ┌────▼────┐  ┌─────▼──────┐
             │ PostgreSQL│  │  Redis  │  │  Storage   │
             │  :5432    │  │  :6379  │  │  (volume)  │
             └───────────┘  └─────────┘  └────────────┘
```

---

## 🚀 Subindo o projeto (do zero em 5 minutos)

### Pré-requisitos
- Docker ≥ 24  +  Docker Compose ≥ 2.20
- `git`

### 1. Clonar e configurar

```bash
git clone <seu-repo> reportstudio
cd reportstudio

# Copiar e editar variáveis de ambiente
cp .env.example .env
nano .env          # ou: code .env
```

### 2. Configurar o `.env` (mínimo para dev local)

```env
SECRET_KEY=gere_com_openssl_rand_hex_32_aqui
DB_PASSWORD=senha_segura
REDIS_PASSWORD=senha_redis

# Stripe (use chaves de TEST para desenvolvimento)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_BUSINESS=price_...
```

> **Gerar SECRET_KEY:**
> ```bash
> openssl rand -hex 32
> ```

### 3. Subir tudo

```bash
docker compose up -d --build
```

Aguarde ~60 segundos na primeira vez (download das imagens + build).

### 4. Acessar

| Serviço       | URL                              |
|---------------|----------------------------------|
| Aplicação     | http://localhost                 |
| API (FastAPI) | http://localhost:8000/api/docs   |
| API (Redoc)   | http://localhost:8000/api/redoc  |

---

## 📋 Comandos úteis

```bash
# Ver status dos containers
docker compose ps

# Logs em tempo real (todos os serviços)
docker compose logs -f

# Logs só do backend
docker compose logs -f backend

# Shell no container do backend
docker compose exec backend bash

# Acessar o banco de dados (psql)
docker compose exec db psql -U rs_user -d reportstudio

# Parar tudo
docker compose down

# Parar e apagar todos os dados (volumes)
docker compose down -v

# Rebuild sem cache (após mudar Dockerfile ou requirements)
docker compose build --no-cache && docker compose up -d

# Shortcut com Makefile
make up          # sobe
make down        # para
make logs        # acompanha logs
make reset       # apaga tudo e sobe do zero
make shell-db    # psql
```

---

## 🔧 Desenvolvimento local (sem Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Rodar PostgreSQL e Redis separadamente (ou via Docker):
docker compose up -d db redis

# Variáveis de ambiente
export DATABASE_URL="postgresql+asyncpg://rs_user:rs_secret@localhost:5432/reportstudio"
export REDIS_URL="redis://:rs_redis_2025@localhost:6379/0"
export SECRET_KEY="dev_secret_key"

# Iniciar com hot-reload
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

---

## 💳 Configurar Stripe

### 1. Criar conta e produtos

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Produtos → Criar produto para cada plano:

| Produto     | Preço BRL | Tipo       |
|-------------|-----------|------------|
| RS Starter  | R$ 49/mês | Recorrente |
| RS Pro      | R$ 129/mês| Recorrente |
| RS Business | R$ 349/mês| Recorrente |

3. Copie os **Price IDs** (`price_...`) para o `.env`

### 2. Configurar webhook

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe   # Mac
# ou: https://stripe.com/docs/stripe-cli

# Escutar eventos locais (dev)
stripe listen --forward-to localhost:8000/api/billing/webhook

# O CLI mostra o webhook secret → copie para STRIPE_WEBHOOK_SECRET no .env
```

### 3. Eventos que o sistema escuta

- `customer.subscription.created` → ativa o plano
- `customer.subscription.updated` → atualiza o plano
- `customer.subscription.deleted` → reverte para Free
- `invoice.payment_failed` → marca como `past_due`

---

## 💰 Estratégia de Preços

### Benchmark de mercado (ferramentas similares)

| Ferramenta        | Plano básico | Categoria           |
|-------------------|-------------|---------------------|
| Tableau Public    | Grátis/US$75| BI enterprise       |
| Power BI Pro      | US$10/user  | BI Microsoft        |
| Looker Studio     | Grátis      | Reports Google      |
| Canva Pro         | US$13/mês   | Design docs         |
| Beautiful.ai      | US$12/mês   | Presentations       |

**Report Studio posicionamento:** ferramenta focada em procurement/compras,
mais simples e direta que BI tools, sem curva de aprendizado.

---

### Tabela de planos recomendada

| Plano         | Preço/mês | Relatórios | Público-alvo                           |
|---------------|-----------|-----------|----------------------------------------|
| **Free**      | R$ 0      | 3         | Teste, avaliação, uso esporádico        |
| **Starter**   | R$ 49     | 30        | Analista individual, pequenas equipes   |
| **Pro**       | R$ 129    | 150       | Equipes de compras, gestores            |
| **Business**  | R$ 349    | Ilimitado | Departamentos, múltiplos analistas      |

### Por que esses números?

**Free — 3 relatórios:**
- Suficiente para avaliar o produto sem precisar de cartão
- Cria urgência natural ("fiquei sem cota") sem frustrar o usuário
- Referência: Notion (1000 blocos), Canva (templates limitados)

**Starter — R$ 49 (≈ US$ 9):**
- Ponto de entrada baixo para remover fricção de conversão
- 30 relatórios = ≈ 1 por dia útil → confortável para 1 analista
- Equivalente a ~2 cafezinhos por semana: fácil de justificar

**Pro — R$ 129 (≈ US$ 24):**
- Plano estrela (maior LTV, maior conversão de upgrade)
- 150 relatórios = time pequeno de 4-5 pessoas com uso moderado
- Posicionado como "profissional": inclui todos os recursos

**Business — R$ 349 (≈ US$ 69):**
- Sem limite para eliminar a objeção de "vai esgotar a cota"
- Âncora de preço que torna o Pro mais atraente por comparação
- Para equipes que geram relatórios diariamente

### Métricas de referência

```
MRR break-even estimado (custo de infraestrutura):
  - 1x VPS 4 vCPU / 8GB RAM: ≈ R$ 150/mês (DigitalOcean, Hetzner)
  - PostgreSQL gerenciado: ≈ R$ 80/mês (opcional)
  - Total infra: ≈ R$ 250/mês

  Break-even: ~6 usuários Starter ou ~2 usuários Pro

MRR targets:
  R$ 1.000/mês = 20 Starters   ou 8 Pros
  R$ 5.000/mês = 38 Pros       ou 14 Business
  R$ 10.000/mês = combinado    ~40-60 usuários pagantes
```

### Dicas de precificação

1. **Anual com desconto de 20%** — aumenta LTV e reduz churn:
   - Starter anual: R$ 470 (equivale a R$ 39/mês)
   - Pro anual: R$ 1.239 (equivale a R$ 103/mês)

2. **Trial de 14 dias no Pro** — converte melhor que free plan generoso
   - Implementar: adicionar campo `trial_ends_at` no modelo User

3. **Preço em USD para clientes internacionais:**
   - Starter: US$ 9/mês
   - Pro: US$ 24/mês
   - Business: US$ 69/mês

4. **Desconto para ONGs/educação:** 50% com verificação de e-mail institucional

---

## 🌍 Deploy em produção

### VPS recomendada (custo-benefício)

```
Hetzner CX21 (2 vCPU / 4GB) = € 5/mês → suficiente até 500 usuários
Hetzner CX31 (4 vCPU / 8GB) = € 10/mês → confortável até 2.000 usuários
```

### Configurar domínio + SSL (Let's Encrypt)

```bash
# 1. Aponte seu domínio para o IP do servidor (DNS A record)

# 2. Instalar Certbot
apt update && apt install -y certbot

# 3. Gerar certificado (porta 80 deve estar livre)
certbot certonly --standalone -d seudominio.com

# 4. Copiar certs para nginx/ssl/
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/seudominio.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/seudominio.com/privkey.pem   nginx/ssl/key.pem

# 5. Atualizar .env
APP_URL=https://seudominio.com
VITE_API_URL=https://seudominio.com/api

# 6. Rebuild e subir
docker compose up -d --build
```

### Atualizar nginx.conf para HTTPS

Adicione ao bloco `server` em `nginx/nginx.conf`:

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    # ... resto da config
}

server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

### Renovação automática de SSL

```bash
# Adicionar ao crontab (cron -e)
0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/seudominio.com/fullchain.pem /caminho/nginx/ssl/cert.pem && \
  cp /etc/letsencrypt/live/seudominio.com/privkey.pem   /caminho/nginx/ssl/key.pem && \
  docker compose exec nginx nginx -s reload
```

### Backups automáticos do banco

```bash
# Adicionar ao crontab
0 2 * * * docker compose exec -T db \
  pg_dump -U rs_user reportstudio | \
  gzip > /backups/rs_$(date +%Y%m%d).sql.gz

# Manter apenas últimos 7 dias
find /backups -name "rs_*.sql.gz" -mtime +7 -delete
```

---

## 📁 Estrutura do projeto

```
reportstudio/
├── docker-compose.yml
├── .env.example
├── Makefile
├── nginx/
│   └── nginx.conf
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── init.sql
│   └── app/
│       ├── main.py
│       ├── core/
│       │   ├── config.py      # Pydantic Settings
│       │   ├── database.py    # SQLAlchemy async engine
│       │   └── auth.py        # JWT + bcrypt
│       ├── models/
│       │   ├── user.py        # User + PlanType enum
│       │   └── report.py      # Report config (JSON)
│       └── routers/
│           ├── auth.py        # /register /login /me
│           ├── users.py       # /users/me (PATCH)
│           ├── reports.py     # CRUD relatórios
│           ├── billing.py     # Stripe checkout/webhook
│           └── plans.py       # Planos públicos
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tailwind.config.js
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── store/
        │   └── authStore.js   # Zustand + persist
        ├── lib/
        │   └── api.js         # Axios + interceptors JWT
        ├── pages/
        │   ├── LandingPage.jsx
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── DashboardPage.jsx
        │   ├── EditorPage.jsx
        │   ├── PricingPage.jsx
        │   └── ProfilePage.jsx
        └── components/
            ├── layout/
            │   └── Navbar.jsx
            └── editor/
                ├── UploadZone.jsx    # Drag & drop XLSX/CSV
                ├── DataTable.jsx     # Tabela editável
                ├── LayoutPanel.jsx   # Config título, KPIs, cores
                ├── ChartsPanel.jsx   # Config gráficos
                ├── ColumnsPanel.jsx  # Visib. e largura
                └── ReportPreview.jsx # Preview ao vivo (Recharts)
```

---

## 🔒 Segurança implementada

- ✅ Senhas com bcrypt (rounds=12)
- ✅ JWT com expiração configurável (padrão: 7 dias)
- ✅ Rate limiting via Nginx (30 req/min geral, 10 req/min em /auth)
- ✅ CORS restrito às origens configuradas
- ✅ Verificação de assinatura Stripe webhook
- ✅ Limite de plano checado no servidor (não só no frontend)
- ✅ Usuário só acessa seus próprios relatórios (row-level)
- ✅ Gzip compressão ativo
- ✅ Cabeçalhos de segurança via Nginx

---

## 🧪 Testando pagamentos (Stripe Test Mode)

```
Cartão aprovado:      4242 4242 4242 4242
Cartão recusado:      4000 0000 0000 0002
Requer autenticação:  4000 0025 0000 3155
Data: qualquer futura · CVV: qualquer 3 dígitos
```

---

## 📞 Suporte

Abra uma issue no repositório ou envie para o email configurado em `EMAIL_FROM`.
