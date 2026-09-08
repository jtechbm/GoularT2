# GoularT

Sistema interno da operação — uso exclusivo do Kadu e da equipe. Clientes **não** têm acesso.

## Rodando

```bash
npm install
cp .env.example .env      # ajuste GOULART_SESSION_SECRET
npm run criar-admin -- kadu@suaempresa.com.br "Kadu Goulart"
npm run dev               # http://localhost:3000
```

O `criar-admin` cria **apenas** o primeiro acesso administrador e mostra a senha sorteada uma única vez
(ou use a sua: `npm run criar-admin -- email nome senha`). O sistema começa vazio: clientes, equipe,
marketplaces, tarefas e canais são cadastrados por dentro dele.

Dentro do sistema, o admin cria os demais acessos em **Equipe**.

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

## Gamificação (estrutura pronta, não ativada)

Toda ação em tarefa grava uma linha em `task_events` com `type` e `points`. Pontuação padrão por prioridade:
baixa 5, média 10, alta 20, urgente 35. O placar dos últimos 30 dias já aparece no dashboard, em Tarefas e
em Equipe — falta só a camada de níveis/medalhas por cima.

## Stack

Next.js 15 (App Router, Server Actions) · React 19 · Tailwind CSS v4 · SQLite via `node:sqlite`
(nativo do Node 24, sem dependência nativa) · sessão em cookie httpOnly com senha em scrypt.

O banco fica em `data/goulart.db`. Backup é copiar o arquivo.

## Convenção de UI

Nada salva sozinho. Toda página de edição termina em um botão **Salvar alterações** explícito
(`SaveBar` em [`src/components/submit.tsx`](src/components/submit.tsx)).

Tema roxo/laranja/preto por padrão, com modo claro (também roxo/laranja) no seletor da barra lateral.
Os tokens de cor estão em [`src/app/globals.css`](src/app/globals.css).
