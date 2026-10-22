# Regras de segurança do Cloud Firestore

O projeto usa **Cloud Firestore** (não Realtime Database). A API Key fica exposta no cliente
(`js/firebase-config.js`), o que é esperado no Firebase. A proteção real dos dados vem das
**regras do Firestore**.

As regras ficam em [`firestore.rules`](../firestore.rules), na raiz do repositório. Elas **não**
são publicadas automaticamente: revise e publique pelo Firebase Console (Firestore Database →
Regras) ou com `firebase deploy --only firestore:rules`.

## O que as regras fazem

- Só o próprio usuário autenticado (`request.auth.uid == uid`) lê e grava em `users/{uid}` e em
  tudo o que fica embaixo:
  - `private/siteState`: formato antigo (schema 1), mantido como backup;
  - `modules/{nome}`: schema 2, um documento por módulo;
  - `images/{sha256}`: schema 2, imagens em data URL;
  - `meta/sync`: schema 2, marca da migração;
  - `rubrica/{pagina}`: página Projetos.
- Requisições sem login ou de outro usuário são negadas.
- **Só as coleções acima** (`private`, `modules`, `images`, `meta`, `rubrica`) aceitam gravação.
  Qualquer outra coleção, subcoleções mais fundas e o próprio documento `users/{uid}` são negados,
  para a conta não virar depósito de dados arbitrários.
- **Limites por documento**, além do limite de 1 MiB que o Firestore já impõe:
  - no máximo 40 campos no nível de cima;
  - `images/*`: o campo `data` precisa ser texto com no máximo 950.000 caracteres; como o
    documento é endereçado pelo hash do conteúdo, uma regravação só pode repetir o mesmo `data`;
  - `modules/*`: `schema == 2`, `rev` inteiro e `data` como mapa; **`rev` só sobe** (o site grava
    `rev + 1` numa transação), o que recusa gravações velhas fora de ordem. A migração regrava
    `rev` 1 sobre 0 ou 1 e é a única exceção;
  - `rubrica/*`: só os campos `p` (página, mapa), `s` (configuração no `__meta`, mapa) e `em`.
- **Lembretes no celular** ([LEMBRETES.md](LEMBRETES.md)) ficam fora de `users/`, em
  `pushSchedules/{uid}` (agenda) e `pushSchedules/{uid}/devices/{id}` (aparelhos). Só o dono lê e
  grava; a agenda tem no máximo 200 lembretes e o site não grava `sent`/`lastRunAt` (são do envio,
  que usa conta de serviço); o endereço do aparelho precisa ser `https://`.
- O site também confere o tamanho antes de enviar. Um módulo acima de ~900 KB (bytes UTF-8) ou uma
  imagem acima de 900 KB mostra um erro claro e não entra em loop de novas tentativas.

## Observação sobre as regras do Firestore

Quando várias regras casam com o mesmo caminho, elas são combinadas com **OU**: basta uma
permitir. Por isso o arquivo não usa um `match /users/{uid}/{document=**}` genérico com
`allow write`, que anularia os limites de `images`, `modules` e `rubrica`. Caminhos sem regra
nenhuma são negados.

## Contra abuso de cota (configuração no console, fora das regras)

As regras impedem que um usuário mexa nos dados de outro, mas qualquer pessoa ainda pode criar
uma conta por email/senha e gravar nos próprios documentos. Para um site pessoal, faça os três
passos abaixo. Eles são feitos no console (não dependem de código) e podem ser desfeitos.

### 1. Fechar a criação de contas

1. Firebase Console → **Authentication** → **Configurações** → **Ações do usuário**.
2. Desmarque **Ativar criação (inscrição)** e salve. Quem já tem conta continua entrando.
3. Em `js/firebase-config.js`, acrescente `allowSignup: false` em `auth`: o site esconde a aba
   "Registrar" e recusa o cadastro (`signup_disabled`). Só o passo 2 bloqueia de verdade; o 3
   evita a tela de cadastro que não funcionaria.

### 2. App Check (reCAPTCHA Enterprise)

Com o App Check **aplicado**, o Firestore e o Authentication só aceitam pedidos vindos do site.

1. Firebase Console → **App Check** → **Apps** → o app da Web → **reCAPTCHA Enterprise** → crie a
   chave para o domínio `marcosdeobjunior.github.io` e copie a *chave do site* (site key).
2. Em `js/firebase-config.js`, acrescente
   `appCheck: { siteKey: "SUA_SITE_KEY" }` (para reCAPTCHA v3: `provider: "recaptcha-v3"`).
   O site carrega `firebase-app-check-compat.js` só quando há `siteKey`.
3. Publique e use o site normalmente por alguns dias. Em **App Check → APIs**, veja as métricas
   de *Cloud Firestore* e *Authentication*: os pedidos devem aparecer como **verificados**.
4. Só então clique em **Aplicar** (enforce) no Firestore e no Authentication.

**Atenção:** com o App Check ligado no site, o login depende do token. Chave errada, domínio
não cadastrado ou bloqueador de scripts do Google faz o login falhar (`auth/network-request-failed`).
Por isso o passo 3 antes do 4; para desfazer, remova `appCheck` da configuração e desaplique no
console. Para testar fora do domínio publicado, use `debug: true` e registre o token de
depuração que aparece no console do navegador em **App Check → Apps → Gerenciar tokens de
depuração**.

### 3. Restringir a API key

Google Cloud Console → **APIs e serviços** → **Credenciais** → a chave do navegador:

- **Restrições de aplicativo**: *Referenciadores HTTP*, com `https://marcosdeobjunior.github.io/*`;
- **Restrições de API**: *Identity Toolkit API*, *Token Service API*, *Cloud Firestore API* e,
  com o App Check, *Firebase App Check API*.

Exigir `request.auth.token.email_verified` nas regras também ajuda, mas o site ainda não tem o
fluxo de verificação de email: ligar isso hoje bloquearia contas novas.

## Como verificar

1. Firebase Console → Firestore Database → **Regras**: confira que o conteúdo é o de
   `firestore.rules`.
2. Use o **Rules Playground**:
   - leitura de `users/OUTRO_UID/modules/livraria` autenticado como você → **negado**;
   - leitura sem autenticação → **negado**;
   - gravação em `users/SEU_UID/modules/livraria` com `{ schema: 2, rev: 1, data: {} }` →
     **permitido**;
   - a mesma gravação sem `rev` → **negado**;
   - gravação em `users/SEU_UID/outra/doc` ou em `users/SEU_UID` → **negado**.
3. Localmente: `cd tests/sync && npm install && npm test` sobe o Firebase Emulator Suite com o
   `firestore.rules` (via `firebase.json`) e roda `tests/sync/rules.mjs` (cada regra acima,
   aceita e recusada) antes dos cenários de sincronização. `npm run test:rules` roda só as regras.
4. Publicar: `firebase deploy --only firestore:rules` (usa o `firebase.json` da raiz) ou copiar o
   arquivo no console.

## Checklist

- [ ] Regras publicadas iguais a `firestore.rules`.
- [ ] Nenhuma regra `allow read, write: if true`.
- [ ] Login por email/senha habilitado; Google e visitante conforme `js/firebase-config.js`.
- [ ] Regras testadas no Rules Playground.
- [ ] Criação de contas desligada no console e `allowSignup: false` no site.
- [ ] App Check com métricas verificadas por alguns dias antes de **Aplicar**.
- [ ] API key restrita ao domínio e às APIs usadas.
