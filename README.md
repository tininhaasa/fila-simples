# Fila de Dúvidas

Fila de atendimento para a sala de aula. Os alunos abrem chamados com a
dúvida, os colegas da turma podem responder e a professora aprova a
resposta (ou atende ela mesma). O dashboard mostra quem pergunta, quem
ajuda e como as dúvidas foram resolvidas.

Feito com **React + Vite** e **Supabase** (login, banco e tempo real); ícones do **Font Awesome**.
Visual nas cores do SENAI (azul `#0D4DA1` e laranja `#F15422`), com
**modo claro e escuro** (botão de sol/lua no topo; a escolha fica salva no navegador).

## Como funciona

**Aluno**
- Cria conta com e-mail e senha e completa o cadastro (nome, matrícula, turma).
- Quando a fila da turma está aberta, escreve a dúvida e vê a posição dele na fila.
- Em **Ajudar colegas**, responde à dúvida de outro aluno da turma.
- Pode cancelar o chamado ou avisar que resolveu sozinho.

**Papéis**
- **Admin geral** (`papel = 'admin'`): vê e gerencia **todas** as turmas; define quem é professor(a)
  e em quais turmas dá aula (Dashboard → lápis na pessoa).
- **Professor(a)** (`papel = 'professor'`): vê **só as turmas em que está vinculado(a)** — fila,
  chamados, alunos e números. Entra numa turma por **link de convite** de um professor da turma
  ou quando o admin geral vincula. Pode criar turmas novas (fica vinculado automaticamente).
- **Aluno**: vê só a fila da própria turma.

**Convites**: Dashboard → Gerenciar turmas → **Convidar professor(a)** gera um link de uso único,
válido por 7 dias. Quem abre o link entra (ou cria a conta) e aceita o convite.

**Professor(a) / admin**
- Abre e encerra a fila de cada turma.
- **Atender** → **Resolvido ✓**.
- **Aprovar respostas**: aprova a resposta do colega (conta como ajuda para ele), recusa (a dúvida volta para a fila, no mesmo lugar) ou atende ela mesma.
- **Dashboard**: números gerais, resumo por turma e a tabela com **todos os alunos**
  (filtro por turma, busca por nome/matrícula/e-mail, último acesso).
  - **Editar** (ícone de lápis): nome, matrícula, turma e papel (aluno ou professora).
    **Remover conta** apaga o login e os chamados da pessoa.
  - **Gerenciar turmas**: criar, renomear, desativar/reativar e excluir turmas vazias.

**Avisos sonoros** (sino no topo liga/desliga; a escolha fica salva no navegador)
- Professora: som quando entra **chamado novo** e outro quando um colega manda **resposta para aprovar**.
- Aluno: som quando **a professora chama** e quando **um colega responde** a dúvida.
- Os sons são gerados pelo navegador (Web Audio API), sem arquivos de áudio.
  O navegador só libera som depois do primeiro clique na página.

## Caminho de um chamado

```
aguardando ──(colega responde)──► respondido ──(professora aprova)──► resolvido (colega)
    │  ▲                              │
    │  └──────(professora recusa)─────┘
    ├──(professora atende)──► em_atendimento ──(resolvido)──► resolvido (professora)
    ├──(aluno: "resolvi sozinho")──────────────────────────► resolvido (sozinho)
    └──(cancelado / fila encerrada)────────────────────────► cancelado
```

## Rodar no computador

1. No Supabase: **SQL Editor → New query**, cole `supabase/banco.sql` e clique em **Run**.
   Depois faça o mesmo, **nesta ordem**, com `supabase/gestao-alunos.sql` e `supabase/professores.sql`.
   (Se um dia rodar o `banco.sql` de novo, rode o `professores.sql` depois dele.)
2. Copie `.env.local.example` para `.env.local` e preencha a URL e a chave anon
   (Supabase → Project Settings → API Keys).
3. No terminal, dentro da pasta:
   ```
   npm install
   npm run dev
   ```
4. Abra http://localhost:5173, crie a sua conta e complete o cadastro.
5. No SQL Editor, vire professora:
   ```sql
   update fila_usuarios set papel = 'admin' where matricula = 'SUA_MATRICULA';
   ```

## Onde fica cada coisa

| Arquivo | O que faz |
|---|---|
| `supabase/banco.sql` | Tabelas, regras de segurança, funções e views do dashboard |
| `supabase/gestao-alunos.sql` | Funções para editar alunos e turmas |
| `supabase/professores.sql` | Papel de professor, vínculo professor↔turma, convites e quem vê o quê |
| `src/convite.js` + `src/pages/AceitarConvite.jsx` | Link de convite de professor |
| `src/components/ui.jsx` | Peças reutilizáveis: botões, janela (modal), campo de senha com olho |
| `src/api.js` | Todas as chamadas ao Supabase |
| `src/useFila.js` | Carrega a fila e atualiza em tempo real |
| `src/tema.js` | Troca entre modo claro e escuro |
| `src/som.js` | Avisos sonoros e o botão de ligar/desligar |
| `src/index.css` | Cores do SENAI e os dois temas (variáveis no topo do arquivo) |
| `src/App.jsx` | Login → cadastro → tela do aluno ou da professora |
| `src/pages/Aluno.jsx` | Minha dúvida + Ajudar colegas |
| `src/pages/Professora.jsx` | Abrir/encerrar fila, atender, aprovar respostas |
| `src/pages/Dashboard.jsx` | Números, turmas e gestão dos cadastros dos alunos |

## Segurança

O aluno só **lê** as tabelas. Toda ação é uma função no banco
(`abrir_chamado`, `responder_chamado`, `aprovar_resposta`…) que confere
quem está chamando. Por isso ninguém consegue, por exemplo, aprovar a
própria resposta ou abrir chamado em outra turma, nem mexendo no código
do navegador.
