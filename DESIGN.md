# Design do Lona

Direção **A+ "Lona"**, aprovada em 2026-10-21. Base calma, com o conteúdo numa folha elevada sobre um fundo quente, e identidade tirada do mundo do caminhão: a lona listrada e o tracejado da estrada. O design muda a pele e o toque, nunca o fluxo: campos, botões, rotas e textos ficam como estão.

Referências: _Designing Fluid Interfaces_ (Apple, WWDC 2018) e a filosofia de design engineering do Emil Kowalski (Sonner, Vaul).

## Princípios

1. **Calma primeiro.** Neutros quentes e uma cor só. A cor da empresa aparece onde há ação ou estado: o botão principal da tela, o item ativo do menu, o switch ligado, o foco.
2. **Folha sobre a lona.** O fundo da página (`canvas`) é quente e levemente escuro. O conteúdo fica numa folha (`sheet`) branca com sombra suave. O menu lateral não tem borda nem fundo próprio: flutua sobre o canvas.
3. **Toque que responde.** Tudo que se aperta afunda (`scale(0.97)`) na hora do clique, não depois. Nenhuma animação trava a interação.
4. **ERP é ferramenta de trabalho.** A mesma tela é aberta dezenas de vezes por dia, então o movimento é mínimo e curto: só feedback de toque e entrada e saída de camadas (dialog, sheet, menu, toast). Navegar entre páginas não anima. Ação de teclado (Ctrl+K, atalhos) nunca anima.
5. **Números são dados.** Algarismos sempre alinhados (`tabular-nums`). CNPJ e códigos em Geist Mono.
6. **Densidade.** O conteúdo usa a largura da tela num container centralizado de até 1280px, igual em todas as páginas. Tabelas ocupam a largura toda, com linhas de 44px, para caber mais itens sem rolar.

## Identidade

- **Marca:** quadrado de 30px, raio 9px, na cor da empresa. Por cima, listras verticais brancas a 22% (a lona) e, embaixo, um tracejado amarelo (a estrada). Ao lado vai o nome "lona" em minúsculas, peso 650 e tracking de -0.03em. Ela muda junto com a cor da empresa.
- **Motivo de lona:** listras verticais de 22px na cor da empresa a 4% de opacidade (5% no escuro). Usado só em superfícies de vitrine: o painel visual da tela de entrar/cadastrar e os estados vazios grandes. Nunca atrás de texto corrido.
- **Tracejado da estrada:** linha de 3px com traços de 18px e intervalos de 14px em `--road` (amarelo). Usado como detalhe, no máximo um por tela.

## Cores

Tokens em `src/app/globals.css`, todos em OKLCH e com versão clara e escura.

| Token                     | Claro                      | Escuro                 | Uso                                   |
| ------------------------- | -------------------------- | ---------------------- | ------------------------------------- |
| `--canvas`                | `oklch(0.972 0.005 85)`    | `oklch(0.16 0.004 85)` | Fundo da página e do menu lateral     |
| `--background` / `--card` | `oklch(1 0 0)`             | `oklch(0.2 0.005 85)`  | Folha de conteúdo, cards, popovers    |
| `--foreground`            | `oklch(0.2 0.006 85)`      | `oklch(0.96 0.004 85)` | Texto principal                       |
| `--muted-foreground`      | `oklch(0.52 0.01 85)`      | `oklch(0.7 0.01 85)`   | Texto de apoio                        |
| `--border`                | `oklch(0.2 0.01 85 / 8%)`  | `oklch(1 0 0 / 8%)`    | Linha fina                            |
| `--border-strong`         | `oklch(0.2 0.01 85 / 14%)` | `oklch(1 0 0 / 14%)`   | Borda de campo                        |
| `--primary`               | cor da empresa             | cor da empresa         | Ação principal, foco, item ativo      |
| `--accent-soft`           | `primary` a 10%            | `primary` a 15%        | Avatar, chip ativo, fundo de destaque |
| `--road`                  | `oklch(0.82 0.15 85)`      | igual                  | Tracejado da estrada                  |
- **Cor da empresa:** as 8 cores (cinza, azul, verde, vermelho, laranja, amarelo, roxo, rosa) continuam com os mesmos valores de `--primary`, que passam no teste de contraste WCAG AA de `globals.test.ts`. Cinza é o padrão.
- **Uma ação principal por tela.** Os outros botões usam `outline` ou `ghost`.
- **Texto secundário** usa `--muted-foreground`, nunca `opacity`.

## Tipografia

Geist (sans) e Geist Mono, pelo `next/font`.

| Papel                | Tamanho   | Peso | Tracking | Entrelinha |
| -------------------- | --------- | ---- | -------- | ---------- |
| Título de página     | 24px      | 600  | -0.025em | 1.15       |
| Título de login      | 30px      | 600  | -0.03em  | 1.1        |
| Número de métrica    | 24px      | 600  | -0.03em  | 1.1        |
| Título de seção/card | 15px      | 600  | -0.01em  | 1.3        |
| Corpo                | 14px      | 400  | 0        | 1.5        |
| Apoio                | 12.5-13px | 400  | 0        | 1.45       |
| Cabeçalho de tabela  | 12.5px    | 500  | 0        | -          |
| Célula de tabela     | 13.5px    | 400  | 0        | -          |
| Mono (CNPJ, código)  | 12.5px    | 400  | 0        | -          |

O tracking aperta conforme o texto cresce. O corpo fica perto de 0.

## Forma e profundidade

- **Raios:** controles 8px, cards e tabelas 12px, folha principal 14px, chips e pílulas 999px.
- **Sombras:**
  - `--shadow-sheet` é anel de 1px em `--border` + `0 1px 2px / 4%` + `0 8px 32px / 5%`. Vale para a folha e os cards elevados.
  - `--shadow-float` é anel + `0 12px 40px / 12%` + `0 2px 6px / 6%`. Vale para popover, menu, dialog e cards flutuantes da vitrine.
  - Botão principal: brilho interno no topo (`inset 0 1px 0` branco a 22%) e uma sombra leve na cor da empresa embaixo.
- **Linhas:** dentro da folha, separadores de 1px em `--border`. Cards dentro da folha não levam sombra: levam só o anel de 1px.

## Movimento

| Token           | Valor                            | Uso                      |
| --------------- | -------------------------------- | ------------------------ |
| `--ease-out`    | `cubic-bezier(0.23, 1, 0.32, 1)` | Entradas, pressão, hover |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet, switch, toast     |

| Interação                                          | Duração               | Como                                                                    |
| -------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| Pressionar botão                                   | 100ms `--ease-out`    | `scale(0.97)` no `:active`                                              |
| Hover de linha ou cor                              | 120-160ms `ease`      | Só com `@media (hover: hover) and (pointer: fine)`                      |
| Switch                                             | 200ms `--ease-drawer` | A bolinha desliza                                                       |
| Popover e menu                                     | 150ms `--ease-out`    | `scale(0.96)` + opacidade, com origem no gatilho (`--transform-origin`) |
| Dialog                                             | 150ms `--ease-out`    | `scale(0.96)` + opacidade, centralizado                                 |
| Sheet                                              | 250ms `--ease-drawer` | Entra e sai pelo mesmo lado                                             |
| Toast                                              | 250ms `--ease-drawer` | Padrão do Sonner, sem blur                                              |
| Navegar entre páginas, item ativo do menu, números | 0ms                   | Sem animação                                                            |
| Ctrl+K e atalhos                                   | 0ms                   | Sem animação                                                            |

Regras:
- Anime só `transform`, `opacity` e `filter`. Nunca `height`, `width` ou `margin`.
- Nada nasce de `scale(0)`. O mínimo é `scale(0.95)` com opacidade.
- Prefira `transition` a `@keyframes` em tudo que pode ser interrompido.
- `prefers-reduced-motion: reduce` deixa só cor e opacidade: sem deslize e sem escala.
- `prefers-reduced-transparency: reduce` deixa o toast sólido.

## Componentes

- **Botão:** `default` usa a cor da empresa com brilho interno. `outline` é a folha com anel em `--border-strong`. `ghost` não tem fundo e ganha `--canvas` no hover. Todos com altura 36px (`sm` 32px), raio 8px e pressão de 0.97.
- **Campo:** fundo da folha, anel em `--border-strong` e sombra interna leve. No foco, anel na cor da empresa mais um halo de 4px em `--accent-soft`. O erro aparece embaixo, em `--destructive`, com `role="alert"`.
- **Switch:** padrão do shadcn (32×18px). Desligado usa `--border-strong`; ligado, a cor da empresa.
- **Menu lateral:** o `Sidebar` do shadcn, variante `inset`, sem customização de estrutura. O item ativo usa o `isActive` padrão (fundo `sidebar-accent`), com o ícone na cor da empresa.
- **Cabeçalho da folha:** 48px de altura, com o botão do menu, o breadcrumb do shadcn ("Empresa › Página") e a busca (Ctrl+K) num campo `--canvas` com `Kbd`.
- **Contador da demonstração:** faixa fina logo abaixo do cabeçalho, com o tempo e o botão de resetar na mesma linha, sem barra de progresso.
- **Container de página:** `mx-auto w-full max-w-7xl`, com padding de 24px, igual em todas as páginas do painel.
- **Cabeçalho de página:** título de 24px com uma linha de apoio embaixo, e a ação principal à direita, na mesma linha.
- **Métricas:** cards em `--canvas` sem borda, com raio 12px, rótulo em apoio e número de 24px.
- **Tabela:** largura total do container, dentro de um card com anel e raio 12px. O cabeçalho tem 36px e fica em `--canvas`, as linhas têm 44px, as ações ficam alinhadas à direita como botões `ghost` pequenos e o hover da linha usa `--canvas`. A pessoa aparece com avatar de iniciais em `--accent-soft`.
- **Chip de vínculo:** pílula `--canvas` com anel e um ponto antes do texto. Ponto cheio na cor da empresa = opera; ponto vazado = só consulta.
- **Toast:** Sonner com o tema do app e a ação "Desfazer".
- **Início, entrar, cadastrar e convite:** tela inteira em duas colunas, no layout próprio do grupo `(auth)`. No início, a coluna da esquerda tem um selo com o tracejado, o título de 56px, o botão da demonstração com uma linha de explicação, três destaques com ícone em `--accent-soft` e os links para entrar e cadastrar.
  - À esquerda, a marca e a troca de tema no topo, e o formulário centralizado (largura máxima 360px).
  - À direita, a vitrine: canvas com o motivo de lona, o tracejado da estrada em diagonal, três cards flutuantes levemente girados (faturamento com barrinhas, OS em execução, venda finalizada) e uma frase curta.
  - No celular, a vitrine some.
- **Estado vazio:** título que convida, uma linha que explica e a ação. Em telas grandes, pode levar o motivo de lona ao fundo.

## Acessibilidade

- Contraste AA em texto e na cor da empresa (testado em `globals.test.ts`).
- Foco visível: anel de 2px na cor da empresa, com 2px de folga.
- Área de toque mínima de 36px no desktop e 44px nos controles da tela do mecânico.
- Ícones decorativos com `aria-hidden`, botões só de ícone com `aria-label`.

## O que não fazer

- Gradiente decorativo, brilho neon, sombra pesada.
- Mais de uma ação na cor da empresa na mesma tela.
- `transition: all`, `ease-in` em interface, animação acima de 300ms em controle (fora sheet e toast).
- Motivo de lona atrás de tabela ou formulário.
- Mudar fluxo, campo ou texto em nome do visual.
