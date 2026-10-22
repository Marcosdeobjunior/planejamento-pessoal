# Plano de melhorias do armazenamento (Firebase)

Origem: análise do sistema de armazenamento (outubro/2026). Os números entre colchetes são os
achados da análise. Cada fase só começa depois que a anterior passa nos testes.

## Como os testes rodam

Tudo roda contra o **Firebase Emulator Suite** (Auth + Firestore), nunca contra o projeto real.
O teste (`tests/sync/`) sobe um servidor estático do site, troca o `js/firebase-config.js` por
uma configuração com `emulators` e `projectId: demo-soter`, e abre **dois navegadores
independentes** (Playwright, contextos separados) fazendo o papel de dois aparelhos da mesma
conta. A nuvem é conferida lendo o Firestore do emulador pela API REST.

```bash
cd tests/sync && npm install
npm test                # todos os cenários
npm test -- T1 T2       # só alguns (repassa os ids para o run.mjs)
```

Requisitos: Node 20+, Java 11+ (emulador do Firestore) e Chromium (Playwright).

## Fase 1 — parar a perda de dados no formato atual (schema 1) — ✅ feita

Antes da correção, T1, T2, T3 e T5 falhavam (T1: a nuvem voltava para o título antigo; T4
passava no limite, com 998 ms). Depois: T1–T7 passam, em duas rodadas seguidas; o envio do
"Salvar" leva ~220 ms. T6 (exclusão) e T7 (isolamento entre contas) são testes de regressão.

| Item | Mudança | Teste |
|---|---|---|
| [1] [3] | Envio por **transação** com merge de 3 vias por chave: o aparelho guarda o hash de cada chave de `state.data` na última sincronização (`soter_sync_base_v1_<uid>`). Chave que só mudou na nuvem vem da nuvem; só mudou aqui vai daqui; mudou nos dois: listas com `id` são unidas por id, o resto fica com a versão local. Vale para a primeira leitura com pendência e para todo envio. | T1: aparelho A com cópia antiga abre Livros → a alteração feita no aparelho B continua na nuvem e aparece em A. T3: A e B editam módulos diferentes ao mesmo tempo → as duas edições ficam. |
| [2] | `soter:storage-hydrated` disparado também no schema 1, para Livros/Cinema/Mangás/RPG relerem o estado. | T2: B renomeia um livro com A aberto em Livros → A mostra o nome novo e, ao salvar outra coisa, não desfaz a mudança de B. |
| [18] | Botão "Salvar" de Livros/Cinema/Mangás envia na hora (`syncFirebaseNow`); espera geral do envio cai de 800 ms para 300 ms. | T4: depois de salvar, a nuvem tem a alteração em menos de 1,5 s. |
| [8] [16] | Tamanho medido em bytes; acima do limite não envia nem repete. Erros permanentes (`invalid-argument`, `permission-denied`) param as tentativas até o conteúdo mudar. Avisa uma vez. | T5: estado acima de 1 MB → nenhuma gravação, um aviso, sem novas tentativas. |
| Regressão | — | T6: exclusão feita em A chega a B e não volta quando B salva outra coisa. T7: outra conta no mesmo navegador não vê nem grava os dados da primeira. |

## Fase 2 — corrigir o schema 2 e ligá-lo para todos — ✅ feita

Antes da correção, com o schema 2 ligado nos testes: T6 (exclusão voltava), T8 (exclusão +
edição simultâneas), T10 (navegador sem a configuração ficava sem sincronizar) e T11 (itens sem
data) falhavam. Depois: os 23 cenários passam (8 no schema 1, 15 no schema 2), em duas rodadas
seguidas.

| Item | Mudança | Teste |
|---|---|---|
| [5] | Base com conteúdo de cada módulo no IndexedDB (store `base`, banco versão 2) e merge de 3 vias (`syncV2Merge3`) no envio: exclusão de um lado é respeitada. A referência do rebase dos salvamentos da página é renovada quando a nuvem atualiza a página. | T6, T8; T14 (banco local antigo, versão 1, atualiza sozinho) |
| [5] | O mesmo item mudado nos dois aparelhos é combinado campo a campo; só o mesmo campo dos dois lados vira conflito (vence o `updatedAt` mais recente). | T1 (status normalizado em A + título em B), T12, T13 |
| [7] | Cópia de conflito gravada depois da transação (a função da transação não tem efeitos fora dela), só quando há conflito de verdade, e limitada às 50 mais recentes. | T12 (sem cópia), T13 (uma cópia) |
| [6] | `updatedAt` carimbado pelo app-shell nos itens criados ou alterados sem data; `serverTimestamp()` nos documentos de módulo (`clientUpdatedAt` guarda a hora do aparelho). | T11 |
| [4] | O formato é da conta: com `meta/sync`, todo navegador ativa o schema 2 (antes, ficava só local). Sem conseguir ler `meta/sync`, não grava em formato nenhum e tenta de novo. | T10 |
| novo | Migração que não cabe (imagem ou módulo acima de 900 KB) volta ao formato antigo na sessão, com aviso, em vez de ficar sem sincronizar. | T15 |
| — | `sync: { schema: 2 }` ligado em `js/firebase-config.js`. | T9 (migração com imagem) |

## Fase 3 — segurança e operação

- [9] App Check, criação de contas fechada, API key restrita, limite de imagens nas regras.
- [17] `firebase.json` com as regras, testes das regras no emulador, regra `rev == anterior + 1`.
- [10] [11] [12] Rubrica: reenvio ao voltar online, lote com merge, limpeza do histórico ao gravar.

## Fase 4 — evolução

- [22] Imagens no Firebase Storage; [13] limpeza de imagens órfãs.
- [14] Exclusão de conta por Cloud Function; [23] exportar tudo (.json) e backup agendado.
- [20] [21] SDK modular v11/v12 empacotado com esbuild; cache `persistentLocalCache`.
- [24] Rubrica no mesmo motor de sincronização.
