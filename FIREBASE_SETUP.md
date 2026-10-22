# Firebase — configuração e o que o código realmente grava

O site usa **Firebase Authentication** (email/senha; Google opcional) e **Cloud Firestore**,
pelo SDK *compat* 10.12.5 carregado em `js/app-shell.js`. Não usa Realtime Database nem
Firebase Storage.

O SDK fica no próprio repositório, em `js/vendor/firebasejs/10.12.5/` (cópia dos arquivos
`firebase-*-compat.js` do pacote npm `firebase@10.12.5`), em vez de vir do CDN `gstatic.com`.
Para atualizar a versão, copie os três arquivos do pacote npm novo para uma pasta com o número
da versão e troque `FIREBASE_SDK_BASE` em `js/app-shell.js`.

Sem login, tudo fica só no navegador (`localStorage`). Com login, cada usuário tem os próprios
dados em `users/{uid}/…`.

## Estrutura no Firestore

Existem dois formatos de sincronização. O **schema 2** (por módulos) vem ligado para todos em
`js/firebase-config.js`. O **schema 1** (documento único) fica como formato antigo: é o backup da
migração e o caminho de reserva quando a migração não cabe (ver abaixo).

```text
users/{uid}/
  private/siteState        schema 1: o estado inteiro num documento
                           { state, updatedAt, source }
  modules/{nome}           schema 2: um documento por módulo
                           { schema: 2, data, rev, updatedAt, deviceId }
  images/{sha256}          schema 2: imagens extraídas dos módulos
                           { data (data URL), mime, bytes, createdAt }
  meta/sync                schema 2: marca da migração
                           { schema: 2, migratedAt, sourceUpdatedAt, deviceId }
  rubrica/{pagina}         página Projetos (grava direto, nos dois formatos)
```

Módulos do schema 2 e as chaves de `state.data` que cada um guarda (definidos em
`FIREBASE_COLLECTION_DEFS`, `js/app-shell.js`):

| Módulo | Chaves |
|---|---|
| `planejamento` | `tasks`, `tarefas` |
| `sonhos` | `sonhos`, `sonhosHub` |
| `livraria` | `trackerLivraria`, `trackerLivros`, `livros`, `livraria`, `libraryTrackerItems`, `libraryHub` |
| `cinema` | `trackerCinema`, `trackerFilmes`, `trackerSeries`, `cinema`, `filmes` |
| `mangas` | `trackerMangas`, `trackerManga`, `mangas` |
| `revisao` | `revisaoPlanner` |
| `financas` | `financasTracker`, `financas`, `financasSavingsGoal`, `financasCategorySets`, `financasRecurrenceRules` |
| `wishlist` | `wishlistTracker`, `wishlist`, `wishlistHistory`, `wishlistGoal` |
| `viagens` | `viagens`, `travels` |
| `academia` | `academiaTracker`, `academia`, `gym`, `treinos`, `workouts` |
| `rpg` | `rpg` |
| `sistema` | `lastVisitedPage`, `lastVisitedAt`, `notifications`, `headerBalanceHidden` **e qualquer chave que não pertença a outro módulo** |
| `perfil` | `{ profile: { name, avatar } }` |

`firebaseSync` e `fileStorage` são metadados deste aparelho e não vão para a nuvem no schema 2.

Toda string que começa com `data:image/` (capas, fotos, avatar) é guardada uma vez em
`images/{sha256}`; no módulo fica `"soterimg:{sha256}"`. Ao carregar, o app-shell troca a
referência de volta pelo data URL antes de entregar o estado às páginas.

## Isolamento entre contas

- Os dados ficam no navegador separados por conta (`soter_state_cache_v2_<uid>`) e o visitante
  tem a própria cópia (`soter_state_cache_v2_guest`).
- Se a conta muda com uma página aberta (login pelo modal, logout ou troca de conta em outra aba),
  a página para de gravar na hora e recarrega depois da primeira leitura da nuvem da conta nova.
  Assim o que estava na tela (da conta anterior ou do visitante) nunca é gravado na conta nova.
- Logout com limpeza marca a conta (`soter_logout_purge_uid_v1`): as outras abas abertas não
  recriam a cópia local dela.
- Schema 1: enquanto este navegador nunca leu a nuvem de uma conta
  (`soter_firebase_hydrated_v1_<uid>`), o estado local dela é só o estado inicial e não sobrescreve
  a nuvem; na primeira leitura, a nuvem vence.

## Como o schema 1 evita sobrescrever outro aparelho

Cada envio de `private/siteState` é uma **transação**: relê o documento e combina com o que está
neste navegador, chave a chave de `state.data`, usando como referência o hash de cada chave na
última sincronização deste aparelho (`soter_sync_base_v1_<uid>` no localStorage):

- a chave só mudou na nuvem → vale a da nuvem (inclusive exclusão);
- só mudou aqui → vale a daqui;
- mudou nos dois → listas com `id` são unidas por id (vence o `updatedAt` mais recente; sem data,
  este aparelho); objetos são combinados campo a campo; o resto fica com este aparelho.

A mesma combinação é feita ao abrir o site com alterações ainda não enviadas. Limitação conhecida:
se os dois aparelhos mexerem **na mesma lista** ao mesmo tempo e um deles tiver excluído um item,
o item excluído pode voltar (resolvido no schema 2, ver `docs/PLANO_ARMAZENAMENTO.md`).

O envio espera 300 ms para agrupar salvamentos seguidos; os botões "Salvar" de Livros, Cinema e
Mangás enviam na hora. Envio recusado de vez (documento acima de ~1 MB, regras, formato inválido)
avisa uma vez e só é tentado de novo quando o conteúdo muda; as alterações ficam neste aparelho.

Os testes com dois aparelhos ficam em `tests/sync/` (Firebase Emulator Suite + Playwright).

## Schema 2: ligado para todos

`sync: { schema: 2 }` em `js/firebase-config.js` liga o schema 2 em todos os navegadores.

**Migração.** No primeiro login de cada conta, o site lê `private/siteState`, divide em módulos,
extrai as imagens, grava tudo e por fim grava `meta/sync`. O `siteState` **não é apagado nem
alterado**: fica como backup. Se a migração falhar no meio, a próxima tentativa recomeça com
segurança (as imagens são gravadas pelo hash e os módulos com `rev` 1). Se não couber (uma imagem
ou um módulo acima de 900 KB), o site avisa e continua sincronizando no formato antigo naquela
sessão; a próxima abertura tenta de novo (depois de diminuir a imagem ou o módulo).

**O formato é da conta.** Depois que `meta/sync` existe, todo navegador usa o schema 2 para essa
conta, mesmo com a configuração desligada (a conta fica marcada em
`soter_sync_v2_account_<uid>`). Só versões **antigas** do site (de antes desta mudança, em cache)
ainda gravariam no `siteState`; isso não afeta os módulos, mas deixa o backup diferente.

**Merge entre aparelhos.** Cada módulo é gravado numa transação que confere `rev`. Se outro
aparelho gravou antes, o envio faz um merge de 3 vias com a base guardada no IndexedDB (store
`base`: o conteúdo do módulo na última sincronização deste aparelho):

- mudou de um lado só → vence esse lado, inclusive exclusão;
- o mesmo item (objeto com `id`) mudou nos dois → combina campo a campo; o mesmo campo mudado
  nos dois → vence o item com `updatedAt` mais recente, e a outra versão é guardada como cópia
  de conflito (store `soter_conflicts`, as 50 mais recentes; `SoterStorage.listSyncConflicts()`);
- item alterado de um lado e excluído do outro → fica (nada é perdido em silêncio).

O app-shell carimba `updatedAt` nos itens que as páginas criam ou alteram sem atualizar a data
(número em ms, ou texto ISO se o item já usava texto). Os documentos de módulo levam `updatedAt`
do servidor (`serverTimestamp`) e `clientUpdatedAt` do aparelho.

## Voltar atrás

1. Comente `sync` em `js/firebase-config.js`. Contas que já migraram continuam no schema 2.
2. Para uma conta voltar ao formato antigo, apague `users/{uid}/meta/sync` no console do
   Firestore e, em cada navegador dela, `localStorage.removeItem("soter_sync_v2_account_<uid>")`.
   O site volta a usar `private/siteState`, **no estado em que estava na migração**. O que foi
   alterado depois disso ficou só nos módulos (`modules/*`).

## Configuração do projeto

1. **Projeto**: no Firebase Console, crie um projeto e um *Web App* e copie as credenciais.
2. **Authentication**: ative **Email/Password** (e **Google**, se quiser).
3. **Firestore Database**: crie o banco (modo *Production*) e escolha a região.
4. **Regras**: revise `firestore.rules` (na raiz do repositório) e publique pelo console
   (Firestore Database → Regras) ou com `firebase deploy --only firestore:rules`. Detalhes em
   `docs/FIREBASE_SECURITY_RULES.md`.
   Os lembretes no celular precisam também de chaves e Secrets no GitHub: ver `docs/LEMBRETES.md`.
5. **Configuração**: edite `js/firebase-config.js`:

```js
window.SOTER_FIREBASE_CONFIG = {
  apiKey: "SUA_API_KEY",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  appName: "soter-app",
  userCollection: "users",
  auth: { enabled: true, emailPassword: true, google: false, allowGuest: false },
  sync: { schema: 2 }      // sincronização por módulos (comente para contas novas ficarem no formato antigo)
};
```

`storageBucket` é preenchido porque faz parte das credenciais, mas o Firebase Storage não é usado.

### Content-Security-Policy

Cada página tem um `<meta http-equiv="Content-Security-Policy">` que limita de onde vêm scripts,
estilos e fontes e para onde o site pode fazer requisições (`connect-src`: Firebase em
`*.googleapis.com`, Nominatim e Open-Meteo). Se o projeto usar um `authDomain` próprio (fora de
`*.firebaseapp.com`) ou outro serviço externo, acrescente o domínio no `frame-src` ou no
`connect-src` de todas as páginas.

## Testar localmente com o Firebase Emulator Suite

`SOTER_FIREBASE_CONFIG` aceita `emulators`, que **só deve ser usado em testes locais**:

```js
emulators: { firestore: "127.0.0.1:8085", auth: "http://127.0.0.1:9099" }
```

Com `firebase emulators:start --only auth,firestore` (firebase-tools) e um `projectId` de
demonstração (por exemplo `demo-soter`), o site conversa com os emuladores em vez do projeto real.
A CSP das páginas não libera `127.0.0.1`: nos testes, desligue a CSP no navegador de teste (no
Playwright, `bypassCSP: true`).
