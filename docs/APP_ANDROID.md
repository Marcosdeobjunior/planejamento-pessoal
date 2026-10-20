# App Android

O app é o próprio site num invólucro Android, uma *Trusted Web Activity* gerada pelo
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). Ele roda no Chrome do aparelho, em
tela cheia e com ícone próprio. Login, dados e lembretes no celular funcionam igual ao site.
Como o conteúdo vem do site publicado, o app se atualiza sozinho a cada merge. Só é preciso gerar
um APK novo quando mudar o ícone, o nome ou a configuração do app.

Não precisa de Android Studio: o GitHub Actions gera o `.apk` e publica numa Release.

## Configuração (uma vez)

### 1. Secrets da chave de assinatura

A chave de assinatura identifica o app. As atualizações só instalam por cima se forem assinadas
com a mesma chave, então **guarde uma cópia** dela fora do GitHub.

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valor |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | o arquivo da chave (`.keystore`) em base64 |
| `ANDROID_KEYSTORE_PASSWORD` | a senha da chave |

Para gerar uma chave nova (precisa de Java):

```sh
keytool -genkeypair -keystore soter.keystore -storetype PKCS12 -alias soter \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Sol de Soter, C=BR"
base64 -w0 soter.keystore   # conteúdo do Secret ANDROID_KEYSTORE_B64
keytool -list -v -keystore soter.keystore | grep SHA256   # impressão digital para o passo 2
```

### 2. Verificação do domínio (sem barra de endereço)

Para o Android abrir o app em tela cheia, sem barra de endereço, o domínio precisa declarar o app
em `https://marcosdeobjunior.github.io/.well-known/assetlinks.json`. Esse endereço é a raiz do
GitHub Pages da conta, servida pelo repositório **`marcosdeobjunior.github.io`**. O conteúdo é:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.github.marcosdeobjunior.soldesoter",
    "sha256_cert_fingerprints": ["<impressão digital SHA256 da chave>"]
  }
}]
```

Esse repositório também precisa de um arquivo `.nojekyll`; sem ele, o GitHub Pages ignora a pasta
`.well-known`. Se a verificação falhar, o app continua funcionando, mas com uma barra fina de
endereço no topo.

## Gerar o app

1. Em **Actions → App Android → Run workflow**, rode na branch `main`. Leva uns 5 minutos.
2. Em **Releases** (na página inicial do repositório, à direita) aparece **App Android 1.0.N**.
   Baixe o `.apk` pelo celular.
3. Abra o arquivo baixado. O Android pede para **permitir instalar apps desta fonte** (Chrome ou
   Arquivos); permita e instale. O Play Protect pode avisar "app desconhecido", porque ele não
   veio da Play Store; toque em **Instalar mesmo assim**.
4. Para atualizar, gere de novo e instale por cima. Os dados ficam na conta do site, então nada se
   perde.

## Dados do app

- Pacote: `io.github.marcosdeobjunior.soldesoter`.
- Abre em `apresentacao.html`.
- Configuração: [`android/twa-manifest.json`](../android/twa-manifest.json).
- Versão: `1.0.N`, onde N é o número da execução do workflow.
- Notificações: os lembretes no celular ([LEMBRETES.md](LEMBRETES.md)) chegam pelo Chrome. No app,
  ative em **Lembretes → Ativar neste aparelho**, como no site.
