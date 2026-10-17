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
  - `images/*`: o campo `data` precisa ser texto com no máximo 950.000 caracteres;
  - `modules/*`: `schema == 2`, `rev` inteiro e `data` como mapa;
  - `rubrica/*`: só os campos `p` (página, mapa), `s` (configuração no `__meta`, mapa) e `em`.
- O site também confere o tamanho antes de enviar. Um módulo acima de ~900 KB (bytes UTF-8) ou uma
  imagem acima de 900 KB mostra um erro claro e não entra em loop de novas tentativas.

## Observação sobre as regras do Firestore

Quando várias regras casam com o mesmo caminho, elas são combinadas com **OU**: basta uma
permitir. Por isso o arquivo não usa um `match /users/{uid}/{document=**}` genérico com
`allow write`, que anularia os limites de `images`, `modules` e `rubrica`. Caminhos sem regra
nenhuma são negados.

## Contra abuso de cota (configuração no console, fora das regras)

As regras impedem que um usuário mexa nos dados de outro, mas qualquer pessoa ainda pode criar
uma conta por email/senha e gravar nos próprios documentos. Para um site pessoal, vale:

- **Authentication → Configurações → Ações do usuário**: desmarcar a criação de contas
  (*sign-up*) depois de criar as contas que vão usar o site;
- **App Check** (reCAPTCHA Enterprise) no Firestore e no Authentication;
- **Google Cloud Console → APIs e serviços → Credenciais**: restringir a API key aos
  referenciadores `https://marcosdeobjunior.github.io/*` e às APIs *Identity Toolkit*,
  *Token Service* e *Cloud Firestore*.

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
3. Localmente, com o Firebase Emulator Suite, o `firebase.json` pode apontar para o
   `firestore.rules`. Os testes deste repositório rodaram assim.

## Checklist

- [ ] Regras publicadas iguais a `firestore.rules`.
- [ ] Nenhuma regra `allow read, write: if true`.
- [ ] Login por email/senha habilitado; Google e visitante conforme `js/firebase-config.js`.
- [ ] Regras testadas no Rules Playground.
- [ ] Criação de contas desligada (se o site é só para você), App Check e API key restrita.
