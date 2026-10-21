# Lembretes no celular

Avisos no celular ou no computador, mesmo com o site fechado:

- tarefas com horário;
- cards da Revisão;
- contas das Finanças;
- treino do dia;
- ante-abandono (livros, séries e mangás parados);
- viagens se aproximando.

Cada pessoa ativa os avisos em **menu do perfil → Lembretes no celular** (no celular: menu →
**Lembretes**) e escolhe o que quer receber e em que horário.

## Como funciona

1. **O site monta a agenda.** Com a conta aberta, o site calcula os lembretes dos próximos 14
   dias e grava em `pushSchedules/{uid}` no Firestore. Para cada lembrete grava só o necessário:
   hora, título, texto curto e página. A agenda é refeita sempre que os dados mudam.
2. **Cada aparelho se inscreve.** Ao ativar, o navegador cria uma inscrição Web Push, e o site
   grava em `pushSchedules/{uid}/devices/{id}`.
3. **O GitHub Actions envia.** O workflow [`lembretes.yml`](../.github/workflows/lembretes.yml)
   executa [`push/send.mjs`](../push/send.mjs), que confere a agenda **a cada minuto** e:
   - lê só a agenda (nunca os dados da conta);
   - envia o que chegou na hora;
   - marca o que foi enviado;
   - apaga as inscrições que o navegador recusou.

   O agendamento do GitHub atrasa muito (na prática roda de poucas em poucas horas). Por isso
   cada execução fica ativa por ~5h40 e, ao terminar, inicia a próxima sozinha. O agendamento
   (`*/30`) fica só como reserva para religar essa corrente se ela parar. Lembretes com mais de
   3 h de atraso são descartados.

A agenda tem um horizonte de 14 dias, então quem não abrir o site por mais de duas semanas para
de receber avisos até voltar.

**A opção fica salva no aparelho.** Fechar o site, o navegador ou o app não desliga os avisos:
eles continuam chegando com tudo fechado, e ao abrir de novo o painel já mostra "Ativado". Isso
vale também quando a sessão termina ao fechar o navegador (login sem "Lembrar de mim"). Se o
navegador descartar a inscrição sozinho, o site faz uma nova na próxima visita, sem pedir nada.

**Isolamento entre contas.** A inscrição de um aparelho pertence a uma conta.

- Sair da conta pelo menu, entrar com outra ou excluir a conta cancela a inscrição.
- Depois de sair pelo menu, ao entrar de novo **com a mesma conta** no mesmo aparelho os avisos
  são reativados sozinhos (`soter_push_resume_v1`). "Desativar neste aparelho" desliga de vez.
- Cada aviso carrega o uid da conta, e o service worker (`sw.js`) só mostra o conteúdo se for a
  conta dona do aparelho. Se não for, cancela a inscrição e mostra um aviso genérico, sem nada da
  outra conta.

**Privacidade.**

- O conteúdo do aviso é criptografado de ponta a ponta (padrão Web Push) até o aparelho.
- Os logs do GitHub Actions são públicos neste repositório. Por isso o script registra só
  contagens: nenhum título, texto ou uid.
- A opção "Esconder detalhes na tela bloqueada" troca o texto por "Lembrete: tarefa" e afins,
  sem nomes nem valores.

## Configuração (uma vez)

### 1. Chaves VAPID

São o par de chaves que identifica o site junto aos serviços de push. A pública fica em
`js/firebase-config.js` (`push.publicKey`). A privada vai **só** para os Secrets do GitHub.

Para gerar um par novo: `cd push && npm ci && npx web-push generate-vapid-keys`. Troque a pública
no `firebase-config.js` e a privada no Secret. Os aparelhos ativados antes precisam ativar de
novo.

### 2. Conta de serviço do Firebase

No Firebase Console: **Configurações do projeto → Contas de serviço → Gerar nova chave privada**.
O arquivo JSON baixado dá acesso total ao projeto, então guarde com cuidado e não coloque no
repositório.

### 3. Secrets no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**, crie:

| Nome | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | a chave pública (a mesma de `js/firebase-config.js`) |
| `VAPID_PRIVATE_KEY` | a chave privada |
| `FIREBASE_SERVICE_ACCOUNT` | o conteúdo inteiro do JSON da conta de serviço |

Sem esses Secrets, o workflow roda e termina sem fazer nada.

### 4. Regras do Firestore

Publique as regras atualizadas de [`firestore.rules`](../firestore.rules), com o bloco
`pushSchedules`, no Firebase Console (Firestore Database → Regras). Sem isso, o site não consegue
gravar a agenda nem os aparelhos.

### 5. Testar

1. No site, abra **Lembretes no celular → Ativar neste aparelho**.
2. Toque em **Enviar teste**. Chega um aviso na hora, enviado pelo próprio aparelho.
3. Em 1 ou 2 minutos chega outro aviso, enviado pelo servidor.
4. Para não esperar o horário agendado, rode o workflow à mão em
   **Actions → Lembretes → Run workflow** (com `minutos` = 0 ele confere uma vez e termina).

## Observações

- **iPhone/iPad (iOS 16.4 ou mais novo):** os avisos só funcionam com o site instalado. No
  Safari, toque em Compartilhar → **Adicionar à Tela de Início** e abra o app por lá. O painel
  mostra essa instrução quando é preciso.
- **Android e computador:** funciona no Chrome, Edge e Firefox, com ou sem instalar.
- **Agendamento sempre ativo:** o GitHub desliga agendamentos de repositórios públicos sem commits
  há 60 dias. A cada execução, o próprio workflow se reativa pela API, sem criar commits.
- **Para parar o envio:** em **Actions → Lembretes**, use "Disable workflow" e cancele a execução
  em andamento.
- **Computador:** com o navegador totalmente fechado, o Chrome e o Edge só mostram os avisos se
  puderem continuar em segundo plano (Configurações → Sistema → "Continuar executando apps em
  segundo plano"). No celular Android chegam com tudo fechado.
- **Avisos com o site aberto:** com os lembretes ativos no aparelho, o aviso local de "hora da
  tarefa" deixa de aparecer, para não chegar duplicado.
- **Para conferir a agenda:** no console do navegador, `SoterPush.preview()` mostra o que seria
  agendado agora.
