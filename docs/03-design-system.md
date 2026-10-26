# 03 — Design system

Minimalista, premium, escuro por padrão. Tokens em [`apps/web/src/index.css`](../apps/web/src/index.css) e [`tailwind.config.ts`](../apps/web/tailwind.config.ts).

## Paleta

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `bg` | grafite `hsl(200 14% 5%)` | `hsl(200 14% 97%)` | fundo |
| `surface` / `surface-2` | `hsl(200 12% 8%)` / `12%` | branco / `94%` | cartões, campos |
| `primary` | azul-petróleo `hsl(190 70% 42%)` | `hsl(192 72% 28%)` | ações, navegação ativa |
| `accent` / `positive` | verde-esmeralda `hsl(158 64% 46%)` | `hsl(160 84% 32%)` | valores recebidos, progresso |
| `negative`, `warning`, `info` | estados | estados | atraso, alertas, informação |
| `--series-1..3` | `#3987e5` `#d95926` `#199e70` | `#2a78d6` `#eb6834` `#1baf7a` | séries de gráficos (paleta categórica validada para daltonismo) |

Status sempre acompanha **rótulo** (nunca só cor). O calendário usa legenda clicável que também filtra categorias.

## Tipografia

Inter (texto) com `tabular-nums` em todos os valores; JetBrains Mono para chaves/códigos.

## Componentes (`src/components/ui`)

`Button` (primary/secondary/outline/ghost/danger, loading) · `Card`/`CardHeader` · `Input`/`Select`/`Textarea`/`Field` · `MoneyInput` (aceita "1.234,56") · `Checkbox` · `Dialog` (bottom-sheet no mobile, modal no desktop) · `ConfirmDialog` · `Badge` · `Segmented` · `Stat` (KPI com nota explicativa) · `CertaintyDot` (real/estimado/projetado) · `EmptyState` · `Toast`.

## Princípios de UX

- Calendário como peça central; dados críticos a 1 clique (Painel com 10 KPIs).
- Cada número diz o que é: "competência", "caixa", "estimado", "declarado".
- Registro rápido: valor, horário e data de pagamento do plantão vêm da tabela da instituição; pré-visualização do líquido em tempo real.
- Mobile-first: navegação inferior com 5 destinos, diálogos como bottom-sheet, `safe-area-inset`.
- Animações discretas (fade de 180–220 ms), respeitando `prefers-reduced-motion`.
- Acessibilidade: foco visível, rótulos em todos os campos, `aria-pressed` em filtros, `role=meter` em orçamentos.

## Gráficos

Seguem a skill de dataviz: eixo único, barras finas com cantos de 4 px, grid recessivo, tooltip por marca, legenda sempre presente para ≥2 séries e rótulos em texto nas barras ranqueadas.
