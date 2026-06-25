# ReAct Agent + OpenCode

Agente ReAct em TypeScript usando **Vercel AI SDK**, executado dentro do **OpenCode**, com ferramentas especializadas para busca, navegação web e leitura de documentos.

O OpenCode é responsável pela experiência de agente (sessão, contexto, workspace e modelos), enquanto o Vercel AI SDK executa o loop ReAct e o tool calling.

---

# Visão Geral da Arquitetura

```text
┌───────────────────────────────────────────────────────────────┐
│ OpenCode                                                     │
│                                                               │
│ • Sessão interativa                                           │
│ • Contexto persistente do workspace                           │
│ • Leitura de AGENTS.md                                        │
│ • Acesso aos modelos nativos                                  │
│ • Execução local do agente                                    │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ ReAct Agent (Vercel AI SDK)                           │    │
│  │                                                       │    │
│  │ Thought → Action → Observe → Thought → Final Answer  │    │
│  │                                                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐     │    │
│  │  │ search   │ │ browse   │ │ read_document      │     │    │
│  │  │ Tavily   │ │Playwright│ │ fetch + parsers    │     │    │
│  │  └──────────┘ └──────────┘ └────────────────────┘     │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│                       Modelos do OpenCode                     │
│                                                               │
│             Claude / Gemini / Qwen / Kimi / etc              │
└───────────────────────────────────────────────────────────────┘
```

---

# Responsabilidade de Cada Camada

| Camada | Responsabilidade |
|----------|----------|
| OpenCode | Ambiente do agente, contexto, AGENTS.md, sessão interativa |
| Vercel AI SDK | Loop ReAct, tool calling e orquestração |
| Search Tool | Busca web estruturada |
| Browse Tool | Navegação em páginas JavaScript |
| Read Document Tool | Leitura de PDFs, JSON, CSV e HTML |
| Modelo | Raciocínio e tomada de decisão |

---

# Fluxo de Execução

Quando o usuário faz uma pergunta:

```text
Usuário
   │
   ▼
OpenCode
   │
   ▼
ReAct Agent
   │
   ▼
Modelo
   │
   ├─ Precisa pesquisar?
   │      └─ search()
   │
   ├─ Precisa abrir página?
   │      └─ browse()
   │
   ├─ Precisa ler documento?
   │      └─ read_document()
   │
   ▼
Resposta Final
```

---

# Como Funciona o Loop ReAct

ReAct significa:

```text
Reasoning + Acting
```

O agente alterna entre:

```text
Thought
↓
Action
↓
Observation
↓
Thought
↓
Action
↓
Observation
↓
Final Answer
```

Exemplo:

Usuário:

```text
Qual a principal novidade do Next.js 15?
```

Passo 1:

```text
Thought:
Preciso descobrir a release mais recente.
```

Passo 2:

```text
Action:
search("Next.js 15 release notes")
```

Passo 3:

```text
Observation:
Resultados encontrados.
```

Passo 4:

```text
Thought:
Preciso abrir a página oficial.
```

Passo 5:

```text
Action:
browse("https://nextjs.org/blog/...")
```

Passo 6:

```text
Observation:
Conteúdo extraído.
```

Passo 7:

```text
Final Answer:
Resumo da release.
```

---

# Estrutura do Projeto

```text
react-agent/
│
├── src/
│   ├── index.ts
│   │
│   └── tools/
│       ├── search.ts
│       ├── browser.ts
│       └── document.ts
│
├── prompts/
│   └── system.ts
│
├── AGENTS.md
├── package.json
├── tsconfig.json
└── .env
```

---

# Dependências

## Instalação

```bash
npm install
```

## Browser

```bash
npx playwright install chromium
```

---

# Variáveis de Ambiente

```env
TAVILY_API_KEY=tvly-xxxx

MAX_STEPS=10
```

---

# Ferramenta 1 — Search

Busca web usando Tavily.

---

## Objetivo

Permitir ao agente obter informações atualizadas da internet.

Ideal para:

- documentação
- changelogs
- notícias
- APIs
- pesquisas gerais

---

## Implementação

```ts
import { tool } from "ai";
import { z } from "zod";

export const searchTool = tool({
  description:
    "Search the web for information and return relevant results.",

  parameters: z.object({
    query: z.string(),
    max_results: z.number().default(5),
  }),

  execute: async ({ query, max_results }) => {
    // chamada Tavily
  },
});
```

---

## Exemplo

Usuário:

```text
O que mudou no React 19?
```

Tool chamada:

```json
{
  "query": "React 19 release notes",
  "max_results": 5
}
```

Resposta:

```json
{
  "answer": "...",
  "results": [...]
}
```

---

## Quando usar

✅ Perguntas factuais

✅ Notícias

✅ Documentação

✅ Pesquisas rápidas

---

## Quando NÃO usar

❌ Conteúdo de uma URL específica

❌ PDFs

❌ Aplicações JavaScript

---

# Ferramenta 2 — Browse

Navegação usando Playwright.

---

## Objetivo

Abrir páginas reais e renderizar JavaScript.

Muitos sites modernos retornam HTML vazio para um fetch simples.

Exemplos:

- Notion
- Vercel
- GitHub
- Dashboards
- Aplicações React
- Aplicações Vue

---

## Implementação

```ts
export const browseTool = tool({
  description:
    "Open and extract content from web pages.",

  parameters: z.object({
    url: z.string(),
    selector: z.string().optional(),
  }),

  execute: async ({ url, selector }) => {
    // Playwright
  },
});
```

---

## Fluxo Interno

```text
1. Abrir Chromium
2. Navegar para URL
3. Esperar renderização
4. Limpar elementos inúteis
5. Extrair texto
6. Retornar conteúdo
```

---

## Exemplo

Usuário:

```text
Leia esse artigo:
https://nextjs.org/blog/next-15
```

Tool chamada:

```json
{
  "url": "https://nextjs.org/blog/next-15"
}
```

Resultado:

```json
{
  "content": "Next.js 15 introduces..."
}
```

---

## Quando usar

✅ Blogs

✅ Sites React

✅ Sites Vue

✅ SPAs

✅ Dashboards

---

## Quando NÃO usar

❌ APIs JSON

❌ PDFs

❌ Arquivos CSV

---

# Ferramenta 3 — Read Document

Leitura de documentos sem navegador.

---

## Objetivo

Consumir arquivos diretamente.

Mais rápido que Playwright.

---

## Tipos suportados

### JSON

```json
{
  "version": "1.0"
}
```

---

### CSV

```csv
name,email
john,john@test.com
```

---

### TXT

```text
Arquivo de texto.
```

---

### HTML estático

```html
<h1>Hello</h1>
```

---

### PDF

Com `pdf-parse`.

---

## Implementação

```ts
export const readDocumentTool = tool({
  description:
    "Read documents and extract content.",

  parameters: z.object({
    url: z.string(),
    max_chars: z.number().default(6000),
  }),

  execute: async ({ url }) => {
    // fetch
  },
});
```

---

## Exemplo

Usuário:

```text
Leia esse PDF e me dê um resumo.
```

Tool:

```json
{
  "url": "https://example.com/report.pdf"
}
```

---

## Quando usar

✅ PDFs

✅ JSON

✅ CSV

✅ TXT

✅ HTML estático

---

## Quando NÃO usar

❌ Aplicações React

❌ Aplicações Angular

❌ SPAs

---

# Registro das Ferramentas

```ts
const tools = {
  search: searchTool,
  browse: browseTool,
  read_document: readDocumentTool,
};
```

---

# Configuração do ReAct Agent

```ts
const result = await generateText({
  model,
  system,
  messages,

  tools,

  maxSteps: 10,
});
```

---

# Exemplo Completo

Pergunta:

```text
Qual é o changelog do Next.js 15?
```

Execução:

```text
Thought:
Preciso localizar a release.
```

```text
Action:
search()
```

```text
Observation:
Resultados encontrados.
```

```text
Thought:
Abrir página oficial.
```

```text
Action:
browse()
```

```text
Observation:
Conteúdo obtido.
```

```text
Final Answer:
Resumo da release.
```

---

# AGENTS.md

```md
# react-agent

Agente ReAct em TypeScript usando Vercel AI SDK.

## Stack

- Node.js
- TypeScript
- Vercel AI SDK
- OpenCode
- Tavily
- Playwright

## Ferramentas

### search

Busca informações atualizadas na web.

### browse

Abre páginas e renderiza JavaScript.

### read_document

Lê PDFs, JSON, CSV, TXT e HTML.

## Comandos

npm run dev

npm start

npx playwright install chromium

## Processo para adicionar uma nova tool

1. Criar arquivo em src/tools
2. Exportar usando tool()
3. Registrar em src/index.ts
4. Atualizar system prompt
5. Atualizar este AGENTS.md
```

---

# Possíveis Ferramentas Futuras

## run_code

Executar JavaScript isolado.

Exemplos:

- cálculos
- transformações
- validações

---

## database_query

Consultar PostgreSQL.

Exemplos:

- analytics
- relatórios
- dashboards

---

## github_tool

Ler repositórios.

Exemplos:

- pull requests
- commits
- changelogs

---

## vector_search

Busca semântica em documentos privados.

Exemplos:

- RAG
- base de conhecimento
- documentação interna

---

# Resumo

A arquitetura é composta por:

```text
OpenCode
    │
    ▼
Vercel AI SDK
    │
    ├── search (Tavily)
    ├── browse (Playwright)
    └── read_document
    │
    ▼
Modelo do OpenCode
```

O OpenCode fornece o ambiente do agente.

O Vercel AI SDK implementa o loop ReAct.

As tools executam ações reais.

O modelo decide qual ferramenta usar, interpreta os resultados e produz a resposta final.