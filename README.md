# Infusion.IA

Hub de marketing com Inteligência Artificial para pequenas e médias empresas brasileiras.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express (Render)
- **Banco:** Supabase (Postgres + Auth)
- **IA:** OpenAI API (GPT-4o) — 5 agentes especializados
- **Imagens:** Leonardo AI

## Setup Local

### 1. Pré-requisitos
- Node.js 18+
- Conta no Supabase, OpenAI e Leonardo AI

### 2. Instalação
```bash
git clone <repo>
cd infusion-ia
npm install
cp .env.example .env
# Preencha .env com suas chaves
```

### 3. Rodar localmente
```bash
npm run dev
```

## Backend (Render)

Endpoints principais:
- `GET /credits`
- `GET /profile` / `PUT /profile`
- `POST /ai-chat`
- `POST /generate-posts`
- `POST /generate-text`
- `POST /generate-post-prompt`
- `POST /generate-image`
- `POST /logo-generator`

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
- Imagem padrão: 5 créditos
- Imagem premium: 10 créditos
- Logo (por mensagem): 2 créditos
- Logo (por imagem): 5 créditos
- Posts gerados: 2 créditos

## Licença

Proprietário — Infusion.IA © 2026
