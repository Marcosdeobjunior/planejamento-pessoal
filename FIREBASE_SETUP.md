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

Existem dois formatos de sincronização. O **schema 1** é o atual e vem ligado por padrão. O
**schema 2** é novo e fica desligado até ser ativado (ver abaixo).

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

## Ativar o schema 2

- **Num navegador só** (para testar): no console do navegador, já no site,
  `localStorage.setItem("soter_sync_schema", "2")` e recarregue a página.
- **Para todos**: em `js/firebase-config.js`, descomente `sync: { schema: 2 }`.

No primeiro login com o schema 2 ligado, o site lê `private/siteState`, divide em módulos,
extrai as imagens, grava tudo e por fim grava `meta/sync`. O `siteState` **não é apagado nem
alterado**: fica como backup. Se a migração falhar no meio, a próxima tentativa recomeça com
segurança (as imagens são gravadas pelo hash e os módulos com `rev` 1).

**Atenção:** depois que `meta/sync` existe, um navegador com o schema 2 desligado não grava mais
no `siteState`. Ele avisa que a conta já usa o formato novo e mantém as alterações só naquele
navegador. Versões **antigas** do site (de antes desta mudança, por exemplo em cache) não sabem
disso e ainda gravariam no `siteState`. Isso não afeta os módulos, mas deixa o backup
diferente do estado real.

## Voltar atrás

1. Apague a chave no navegador: `localStorage.removeItem("soter_sync_schema")`, ou comente de
   novo `sync` em `js/firebase-config.js`.
2. Para o formato antigo voltar a gravar, apague `users/{uid}/meta/sync` no console do
   Firestore. O site volta a usar `private/siteState`, **no estado em que estava na migração**.
   O que foi alterado depois disso ficou só nos módulos (`modules/*`).

## Configuração do projeto

1. **Projeto**: no Firebase Console, crie um projeto e um *Web App* e copie as credenciais.
2. **Authentication**: ative **Email/Password** (e **Google**, se quiser).
3. **Firestore Database**: crie o banco (modo *Production*) e escolha a região.
4. **Regras**: revise `firestore.rules` (na raiz do repositório) e publique pelo console
   (Firestore Database → Regras) ou com `firebase deploy --only firestore:rules`. Detalhes em
   `docs/FIREBASE_SECURITY_RULES.md`.
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
  auth: { enabled: true, emailPassword: true, google: false, allowGuest: false }
  // sync: { schema: 2 }   // liga a sincronização por módulos para todos
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
