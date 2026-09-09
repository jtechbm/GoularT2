# GoularT

Sistema interno da operação — uso exclusivo do Kadu e da equipe. Clientes **não** têm acesso.

## Rodando

```bash
npm install
cp .env.example .env      # informe DATABASE_URL e GOULART_SESSION_SECRET
npm run migrar            # cria as tabelas no Supabase
npm run criar-admin -- kadu@suaempresa.com.br "Kadu Goulart"
npm run dev               # http://localhost:3000
```

O `criar-admin` cria **apenas** o primeiro acesso administrador e mostra a senha sorteada uma única vez
(ou use a sua: `npm run criar-admin -- email nome senha`). O sistema começa vazio: clientes, equipe,
marketplaces, tarefas e canais são cadastrados por dentro dele.

Dentro do sistema, o admin cria os demais acessos em **Equipe**.

Não rode `npm run build` com o `npm run dev` aberto: os dois escrevem na mesma pasta `.next` e o
servidor de desenvolvimento quebra com `__webpack_modules__[moduleId] is not a function` e/ou perde o CSS.
Se acontecer, pare o dev, apague a pasta `.next` e suba de novo.

## O que já está de pé

- **Dashboard** — faturamento, lucro, margem, impostos e Ads da carteira inteira, com comparativo mês a mês,
  composição por marketplace, clientes que precisam de atenção e resumo de tarefas.
- **Clientes** — cadastro, listagem com busca/filtros e página interna por cliente com abas:
  visão geral, financeiro, marketplaces, ads, histórico, equipe e dados cadastrais.
- **Responsável e equipe** — cada cliente tem um responsável e um time com papel (analista, tráfego, conteúdo…).
- **Marketplaces** — contas de Shopee e Mercado Livre por cliente, com status, ID externo e sincronização.
- **Ads** — investimento por cliente, marketplace e período, com ROAS/ACOS e ranking de investimento.
- **Tarefas** — gestor publica no mural, funcionário pega, conclui; prioridade, prazo, cliente vinculado e pontos.
- **Chat interno** — canais gerais ou por cliente.
- **Equipe** — criação de acessos, papéis, carga de trabalho e placar de pontos.

## Papéis

| Papel | Pode |
| --- | --- |
| `admin` | tudo, inclusive integrações e gestão de acessos |
| `gestor` | carteira, cadastro de clientes, tarefas, equipe |
| `membro` | opera clientes atribuídos, pega tarefas, lança financeiro e anotações |

## Integrações (Shopee e Mercado Livre)

O sistema traz **apenas os valores finais do mês**: faturamento, taxas do marketplace, frete, impostos e
quantidade de pedidos. Custo de produto e investimento em Ads continuam sendo lançados pela equipe — a
sincronização preserva esses dois campos quando já preenchidos.

Fluxo:

1. Cadastre a conta do cliente em **Cliente → Marketplaces**.
2. Preencha as chaves no `.env`:
   - Mercado Livre: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`
   - Shopee: `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI`
3. Em **Integrações**, clique em *Conectar* — o OAuth devolve o token, que é gravado cifrado (AES-256-GCM).
4. *Sincronizar* puxa o fechamento do mês escolhido e grava em `finance_snapshots` com `source = 'api'`.

Cada tentativa fica registrada em **Integrações → Log de sincronizações**.

Adaptadores em [`src/lib/integrations/`](src/lib/integrations/): `mercadolivre.ts` (OAuth + refresh + `/orders/search`)
e `shopee.ts` (assinatura HMAC + `get_order_list` / `get_escrow_detail`). Para um marketplace novo, basta
implementar a interface `MarketplaceAdapter` e registrá-lo em `index.ts`.

## Sincronização

Automática: a Vercel chama `/api/cron/sincronizar` uma vez por dia (03:00 de Brasília),
protegida por `CRON_SECRET`. A fila é ordenada pela conta mais desatualizada e cada
execução processa o que couber no tempo da função — como roda todo dia, a fila se
resolve sozinha.

Manual: pelo botão na página do cliente, ou por linha de comando:

```bash
npm run sincronizar                    # todas as contas, mês atual
npm run sincronizar -- 2026-08         # mês específico
npm run sincronizar -- --diagnostico   # só inspeciona os tokens, não grava
```

### O que a API traz e o que não traz

Do Mercado Livre vêm faturamento, taxas, impostos retidos e quantidade de pedidos.

**Não vêm, e continuam sendo lançados pela equipe:** custo do produto, investimento
em Ads e **frete**. O frete que aparece no pedido do ML é o que o *comprador* pagou,
não o custo do vendedor — contá-lo como despesa derruba o lucro indevidamente.

## Gamificação (estrutura pronta, não ativada)

Toda ação em tarefa grava uma linha em `task_events` com `type` e `points`. Pontuação padrão por prioridade:
baixa 5, média 10, alta 20, urgente 35. O placar dos últimos 30 dias já aparece no dashboard, em Tarefas e
em Equipe — falta só a camada de níveis/medalhas por cima.

## Stack

Next.js 15 (App Router, Server Actions) · React 19 · Tailwind CSS v4 · Postgres no Supabase
(driver `pg`) · sessão em cookie httpOnly com senha em scrypt.

### Banco

A conexão vem de `DATABASE_URL`. O Supabase oferece dois poolers:

| Pooler | Porta | Quando usar |
| --- | --- | --- |
| Session | 5432 | servidor Node persistente (`npm run dev`, `npm start`, VPS, container) — **padrão** |
| Transaction | 6543 | ambientes serverless, onde cada requisição abre conexão nova |

`npm run migrar` cria o esquema e é idempotente — pode rodar quantas vezes quiser.
`npm run migrar -- --limpar` esvazia todas as tabelas antes, e por isso exige
`PERMITIR_LIMPAR=sim` — sem isso ele recusa, para ninguém apagar produção sem querer.

### Banco de desenvolvimento

Hoje o `.env` local aponta para o mesmo banco da produção: qualquer teste escreve
em cima dos dados reais. O certo é criar um **segundo projeto no Supabase** (grátis),
apontar o `.env` local para ele e rodar `npm run migrar`. A produção continua usando
a `DATABASE_URL` configurada na Vercel.

A conexão é sempre TLS. Por padrão a cadeia do certificado não é validada, que é o que o
pooler aceita sem configuração extra; para validação completa, aponte `DATABASE_SSL_CA`
para o certificado da Supabase.

## Convenção de UI

Nada salva sozinho. Toda página de edição termina em um botão **Salvar alterações** explícito
(`SaveBar` em [`src/components/submit.tsx`](src/components/submit.tsx)).

Tema roxo/laranja/preto por padrão, com modo claro (também roxo/laranja) no seletor da barra lateral.
Os tokens de cor estão em [`src/app/globals.css`](src/app/globals.css).
