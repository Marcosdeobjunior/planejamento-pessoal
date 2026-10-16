# Design system — Sól de Sóter

Base visual do site, tendo a página **Revisão** (`revisao.html`) como referência.
As páginas vão adotar os componentes aos poucos, uma por PR.

- **Tokens**: `css/design-system.css` (variáveis `--ds-*`). As variáveis antigas
  (`--bg`, `--card`, `--accent1`…, `--font-*`, `--radius`, `--site-content-width`)
  continuam valendo, porque várias páginas dependem delas.
- **Componentes**: `css/components.css` (classes `ds-*`, carregado logo depois
  de `design-system.css` em todas as páginas). O prefixo evita colisão com
  `.card`, `.btn`, `.tab` etc. que as páginas já usam.
- **Área de conteúdo**: `.app-content` em `css/app-shell.css` usa os tokens de
  layout (margem lateral `--ds-gutter`, topo = header + `--ds-page-pad-top`).

## Tokens

| Grupo | Tokens |
|---|---|
| Fontes | `--ds-font-display` (Playfair Display), `--ds-font-ui` (Syne), `--ds-font-mono` (DM Mono) |
| Texto | `--ds-fs-h1` 40 · `--ds-fs-stat` 30 · `--ds-fs-h2` 24 · `--ds-fs-h3` 17 · `--ds-fs-lg` 14 · `--ds-fs-base` 13 · `--ds-fs-sm` 12 · `--ds-fs-xs` 11 · `--ds-fs-label` 10 · `--ds-ls-label` 2px |
| Espaços | `--ds-sp-1` 4 · `-2` 8 · `-3` 12 · `-4` 14 · `-5` 20 · `-6` 28 · `-7` 40 · `-8` 50 |
| Layout | `--ds-header-h` 58 · `--ds-subnav-h` 44 · `--ds-content-max` 1785 · `--ds-gutter` 20 (16 até 640px) · `--ds-page-pad-top` 28 · `--ds-page-pad-bottom` 50 |
| Superfícies | `--ds-radius` 14 · `--ds-radius-btn` 9 · `--ds-radius-btn-sm` 7 · `--ds-radius-btn-lg` 12 · `--ds-radius-input` 9 · `--ds-radius-modal` 20 · `--ds-card` · `--ds-border` · `--ds-border-hover` · `--ds-input-bg` |
| Cores | `--ds-bg` · `--ds-text` · `--ds-muted` · `--ds-muted-2` · `--ds-gold` · `--ds-gold-2` · `--ds-teal` · `--ds-rose` · `--ds-violet` · `--ds-sky` · `--ds-amber` |

`--ds-muted` (#8a87a0) é mais claro que o cinza da Revisão (#6b6882) para dar
contraste de pelo menos 4.5:1 com texto pequeno sobre o fundo e os cards.

## Componentes

### Cabeçalho da página

```html
<div class="ds-page-head">
  <div>
    <h1>Revisão <em>Espaçada</em></h1>
    <p class="ds-page-sub">sexta-feira, 16 de outubro</p>
  </div>
  <button class="ds-btn ds-btn--gold" type="button">Novo</button>
</div>
```

### Card

```html
<section class="ds-card">
  <div class="ds-card-head">
    <span class="ds-card-label">Previsão</span>
    <button class="ds-btn ds-btn--ghost ds-btn--sm" type="button">Ver tudo</button>
  </div>
  <div class="ds-card-body">Conteúdo</div>
</section>
```

### Estatísticas

Variantes da faixa superior: `--gold`, `--teal`, `--rose`, `--violet`, `--amber`.

```html
<div class="ds-stat-grid">
  <div class="ds-stat ds-stat--gold">
    <div class="ds-stat-label">Para revisar</div>
    <div class="ds-stat-value">12</div>
    <div class="ds-stat-sub">cards vencidos</div>
  </div>
</div>
```

### Botões

Tamanhos: `ds-btn--sm`, `ds-btn--lg`. Estilos: `ds-btn--gold`, `ds-btn--ghost`,
`ds-btn--teal`, `ds-btn--rose`.

```html
<button class="ds-btn ds-btn--gold" type="button">Salvar</button>
<button class="ds-btn ds-btn--ghost ds-btn--sm" type="button">Cancelar</button>
<button class="ds-btn ds-btn--rose" type="button">Excluir</button>
```

### Campos

```html
<label class="ds-field-label" for="nome">Nome</label>
<input class="ds-field" id="nome" placeholder="Digite…">

<select class="ds-field"><option>Opção</option></select>
<textarea class="ds-field"></textarea>
```

### Subnavegação

Fica fixa logo abaixo do header e rola na horizontal no celular. Marque a aba
atual com `is-active` ou `aria-current="page"`.

```html
<nav class="ds-subnav" aria-label="Seções">
  <button class="ds-subnav-tab is-active" type="button">Dashboard</button>
  <button class="ds-subnav-tab" type="button">Decks</button>
</nav>
```

### Estado vazio

```html
<div class="ds-empty">
  <i class="fas fa-inbox" aria-hidden="true"></i>
  <p>Nada por aqui ainda.</p>
</div>
```

Todos os componentes desligam transições e animações com
`prefers-reduced-motion: reduce`.
