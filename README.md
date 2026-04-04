# Infusion.IA

Hub de marketing com Inteligência Artificial para pequenas e médias empresas brasileiras.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Auth, DB, Storage, Edge Functions em Deno)
- **IA:** OpenAI API (GPT-4o) — 5 agentes especializados
- **Imagens:** Leonardo AI
- **Pagamentos:** Pagar.me + InfinitePay

## Setup Local

### 1. Pré-requisitos
- Node.js 18+
- Supabase CLI instalado: `npm install -g supabase`
- Conta no Supabase, OpenAI e Leonardo AI

### 2. Instalação
```bash
git clone <repo>
cd infusion-ia
npm install
cp .env.example .env
# Preencha .env com suas chaves
```

### 3. Banco de dados
Execute as migrations em ordem no Supabase SQL Editor:
```
supabase/migrations/
```

### 4. Edge Functions
```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF

# Configure os secrets
supabase secrets set AI_API_KEY=sk-...
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set LEONARDO_API_KEY=...
supabase secrets set PAGARME_API_KEY=...

# Deploy das functions
supabase functions deploy --no-verify-jwt
```

### 5. Rodar localmente
```bash
npm run dev
```

## Agentes de IA

| Agente | Função | Modelo |
|--------|--------|--------|
| Agente 1 | Consultor de Marketing | GPT-4o |
| Agente 2 | Designer de Logo | GPT-4o |
| Agente 3 | Gerador de Posts | GPT-4o |
| Agente 4 | Otimizador de Prompts | GPT-4o-mini |
| Agente 5 | Validador de Conteúdo | GPT-4o-mini |

## Rotas

| Rota | Página |
|------|--------|
| `/login` | Autenticação |
| `/` | Dashboard de Marketing |
| `/chat` | Consultor IA |
| `/meu-negocio` | Perfil do Negócio |
| `/gerador` | Gerador de Imagens |
| `/logo-generator` | Criador de Logo |
| `/biblioteca` | Biblioteca de Templates |
| `/configuracoes` | Configurações |

## Sistema de Créditos

- Chat (por mensagem): 1 crédito
- Imagem padrão: 3 créditos
- Imagem premium: 6 créditos
- Logo (por mensagem): 2 créditos + 2/imagem gerada
- Posts gerados: 2 créditos

## Licença

Proprietário — Infusion.IA © 2026
