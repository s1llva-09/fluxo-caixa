# Design — Monetta

<!-- impeccable:design 1 -->

Sistema visual do **app** (`app.html` + `css/`). A landing (`index.html`) tem
CSS próprio inline e **não** segue este documento — ainda está no mundo antigo
(Inter + Sora, cards arredondados, violeta do Tailwind).

Escrito a partir do que está construído, não do que se pretendia construir.
Seed da direção: `471c0ec5`. O contrato completo vive no topo do `<body>` do
`app.html`.

## O mundo: A PLACA, na paleta do logo

A estrutura vem da **placa de preço de mercado** — o objeto que o dono de
comércio lê a vida inteira, feito pra ser entendido de longe, em pé, com pressa.
A cena de uso é essa: celular na mão, atrás do balcão, entre um cliente e outro.

Três regras de estrutura:

1. **UM número manda em cada tela; o resto é letra miúda.** Por isso o dashboard
   não tem três cards de métrica iguais.
2. **Rótulo de seção sustentado por um fio.** É o gesto que mais se repete e o
   que dá ritmo à página.
3. **Cor é informação, nunca enfeite.**

**O que este mundo recusa:** o painel SaaS financeiro genérico — gráfico de área
com gradiente, três métricas de peso igual, sombra de hover prometendo clique que
não existe, tipografia Inter+Sora, accent violeta do Tailwind. Era o que o app
tinha, montado de referências (os comentários do CSS antigo citavam Stripe,
Linear e Lovable nominalmente).

## Cor — tudo vem do logo

A paleta inteira é derivada de `icon.svg` / `favicon.svg`, não de um framework:

| Fonte no logo | Valor | Onde vira o quê |
|---|---|---|
| gradiente do "M" (claro) | `#C68BFF` | accent do tema escuro, destaque do login |
| gradiente do "M" (núcleo) | `#9A3FF0` | **a cor da ação** — botão, chip ativo, foco |
| gradiente do "M" (profundo) | `#7A28DD` | hover do botão primário |
| tile | `#0B0E1A` | chão do tema escuro e da tela de entrada |
| canto do tile | rx 116/512 = **23%** | a linguagem de curva do sistema |

Estes violetas **não são os do Tailwind** (`#7C3AED` e vizinhos) — era isso que
deixava o app com cara de template.

| Papel | Claro | Escuro |
|---|---|---|
| Fundo | `#F0EFF4` | `#0B0E1A` |
| Placa (superfície) | `#FFFFFF` | `#131726` |
| Tinta | `#141726` | `#EDEEF4` |
| Ação (`--c-accent`) | `#9A3FF0` | `#B47AFA` |
| Ação em texto (`--c-accent-text`) | `#5B1FAB` | `#C68BFF` |
| Campo claro (`--c-accent-soft`) | `#EDE2FE` | `#2A1D46` |
| Entrada | `#0F6B47` | `#4ED598` |
| Saída | `#B3261E` | `#FF8A75` |

Os neutros levam um sopro do violeta da marca — não são cinza puro nem o slate
azulado de todo painel SaaS. A tinta é derivada do navy do tile.

### As leis da cor

- **Violeta é AÇÃO e posição.** Botão primário, segmentado ativo, chip ligado,
  item de menu ativo, aba ativa, anel de foco, barra de composição.
- **`--c-accent` para campo, `--c-accent-text` para texto.** O `#9A3FF0` puro dá
  4.8:1 — ótimo como área e como fundo de botão com texto branco, mas curto
  demais para virar link. O `-text` dá 9.4:1.
- **Verde e vermelho ficam fora da marca de propósito.** São a direção do
  dinheiro, o único sinal que o app precisa dar, e não podem ser confundidos com
  "cor da empresa". É também a razão de a marca não poder ser verde.
- **Aviso tem cor própria** (âmbar). Em faixa de largura cheia, o violeta viraria
  a maior área colorida da tela e competiria com o botão.

Todos os pares passam AA nos dois temas (mínimo medido: 4.71:1).
`tests/contraste_test.html` verifica isso lendo os tokens do CSS de verdade.

## Forma

**A curva vem do logo:** 23% do lado. A rampa cresce com o tamanho da peça, senão
um raio fixo pequeno numa superfície grande lê como reto.

| Token | Valor | Onde |
|---|---|---|
| `--radius-xs` | 6px | chip de ícone, botão pequeno, barra do gráfico |
| `--radius-sm` | 8px | botão, campo, item de menu |
| `--radius` | 12px | placa (card), painel |
| `--radius-lg` | 18px | modal, placa de saldo, gaveta |
| `--radius-full` | — | etiqueta, chip, ponto, cápsula da aba ativa |

`.brand__mark` usa `border-radius: 23%` literal, para a curva ser a da marca em
qualquer tamanho que o tile assuma.

**Sombra** em camadas, com o tinte do navy da marca, sempre com deslocamento e
desfoque — halo sem offset é decoração, não profundidade. Quatro degraus:
`--shadow-xs` (placa em repouso), `--shadow-sm` (hover de botão, placa de
saldo), `--shadow-md` (tooltip), `--shadow-over` (modal, gaveta, toast).

## Tipografia

**Uma família: Archivo variável**, com os eixos de largura (62–125%) e peso
(400–800) num arquivo só por subset.

A **largura é o recurso de design**, não um detalhe:

| Voz | `font-stretch` | Onde |
|---|---|---|
| Número-placa | 68% / 800 | saldo (`.metric--placa`, `.saldo__value`) |
| Número em lista | 78% / 600–700 | `.num`, valores, tabela, totais |
| Rótulo / botão | 82–88% / 700 | caixa-alta, `letter-spacing` 0.05–0.12em |
| Texto | 100% / 400–600 | corpo, descrição, hint |

Escala: `--fs-2xs` 11 · `--fs-xs` 12 · `--fs-sm` 13 · `--fs-md` 14 (corpo)
· `--fs-lg` 15. Corpo em 14px e `line-height: 1.45` — densidade de ferramenta,
não de página de marketing.

Todo valor monetário leva `font-variant-numeric: tabular-nums`.

## Composição

- **Densidade:** `--gap: 14px`, `--pad-card: 18px`, topbar 56px, lateral 228px.
- **A placa do dashboard** (`.metrics--dash` + `.metric--placa`) ocupa a linha
  inteira; entradas e saídas ficam embaixo em duas colunas, corpo menor.
- **A fita** (`.tx`): data em coluna fixa de 58px à esquerda, descrição no meio,
  valor tabular à direita. Empilha no celular abaixo de 640px.
- **A barra inferior** tem 5 abas fixas; o que não cabe vive na gaveta atrás de
  "Mais". Nunca rola na horizontal.

## Movimento

`--ease: cubic-bezier(0.22, 1, 0.36, 1)` em tudo, durações de 0.12–0.26s.

- **Hover de ação:** ergue 1px, aprofunda a cor, sobe um degrau de sombra.
- **Aba ativa:** a cápsula violeta entra com um `scale` curto (`aba-in`).
- **Entrada de tela:** fade de 0.2s no bloco inteiro. **Não** há escalonamento
  filho a filho — ele atrasava em até 300ms justamente o número que o dono abriu
  o app pra ver.
- `prefers-reduced-motion` zera tudo.

## Componentes que carregam o mundo

| Peça | O que faz dela deste sistema |
|---|---|
| `.metric--placa` | cifra pequena e erguida + número condensado gigante |
| `.btn--primary` | campo violeta do "M", texto branco, sem contorno |
| `.seg-group` | trilho rebaixado; a opção ativa vira campo violeta |
| `.nav__item.is-active` | campo violeta claro com tinta violeta escura |
| `.bottom-nav__item.is-active` | cápsula violeta atrás do ícone |
| `.compo__fill` | barra chapada no violeta da marca |
| `.tx__meta` | data como coluna fixa via `order: -1`, sem tocar na marcação |

## O que não voltar a fazer

- Violeta do Tailwind (`#7C3AED`) ou qualquer accent que não venha do logo.
- Gradiente em texto, botão ou preenchimento de dado.
- Sombra de hover em card não clicável.
- Barra colorida na borda de card ou item de lista.
- Ícone circular repetindo o que a cor e o sinal do valor já dizem.
- Três cards de métrica do mesmo tamanho no dashboard.
- Marca verde ou vermelha: essas cores pertencem à direção do dinheiro.

## Pendências

- A **landing** (`index.html`) segue no mundo antigo. Alinhar é trabalho à parte.
- Os **ícones do PWA** (`icon-*.png`) foram gerados do logo e continuam válidos;
  o **logo 3D definitivo** segue pendente (ver `PRODUCT.md`).
- A inspeção visual de **tema escuro e celular** não foi concluída no browser (a
  extensão do Chrome caiu no meio, duas vezes). O contraste foi verificado por
  cálculo nos dois temas; composição no escuro e no celular ainda merece um
  olhar. `tests/preview.html` renderiza o sistema inteiro sem precisar de login,
  com botão de tema e de modal.
