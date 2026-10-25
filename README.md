# Conecta Web

Chamadas de áudio e vídeo no navegador: salas com código, link de convite, microfone/câmera, compartilhamento de tela e interface responsiva. Feito com Node.js, Express, Socket.IO e WebRTC (sem framework de front-end).

> **Status honesto:** a lógica do servidor, a sinalização e o cliente Socket.IO foram testados automaticamente. **Áudio, vídeo, compartilhamento de tela e chamadas entre redes diferentes NÃO foram testados** (não havia navegador, câmera nem rede no ambiente de desenvolvimento). Use o roteiro da seção 5. Detalhes em `RELATORIO-DE-TESTES.txt`.

## 1. Como executar no Windows (iniciantes)

1. Instale o Node.js **LTS** em https://nodejs.org (versão 18 ou superior).
2. Extraia o ZIP e dê dois cliques em **`INICIAR-CONNECTA-WEB.bat`**.
   Na primeira vez ele instala as dependências (precisa de internet) e cria o arquivo `.env`.
3. Abra no navegador: **http://localhost:3000** (o navegador não abre sozinho).
4. **Parar:** na janela preta, pressione `Ctrl+C` (ou feche a janela).
   **Reiniciar:** dê dois cliques em `INICIAR-CONNECTA-WEB.bat` de novo.
5. Se aparecer "porta já em uso", há outra janela do Conecta Web aberta. Feche-a ou altere `PORT` no `.env`.

Testes: `TESTAR-CONNECTA-WEB.bat`.

## 2. Configuração (`.env`)

| Variável | Para quê | Padrão |
|---|---|---|
| `PORT` | Porta do servidor | 3000 |
| `MAX_PARTICIPANTS` | Máximo por sala (2–50) | 6 |
| `ALLOWED_ORIGINS` | Origens extras permitidas (CORS), separadas por vírgula | vazio = só mesma origem |
| `TRUST_PROXY` | `true` atrás de proxy/HTTPS da hospedagem | false |
| `STUN_URLS` | Servidores STUN | Google STUN |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Servidor TURN (opcional) | vazio |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | Limite de criar/entrar em salas por IP | 20 / 60 |

**STUN × TURN:** STUN apenas descobre seu endereço público; ele **não garante** chamadas em todas as redes (redes corporativas, alguns 4G/5G e NATs simétricos exigem TURN, que retransmite a mídia). Sem TURN configurado, algumas pessoas simplesmente não conseguirão se conectar. Nenhuma credencial TURN vem no código: preencha no `.env`/painel da hospedagem. Observação: o navegador precisa receber a credencial TURN para usá-la; prefira credenciais temporárias do seu provedor.

## 3. Arquitetura

- `server.js`: Express (estáticos, `/healthz`, `/api/config`), cabeçalhos de segurança, Socket.IO.
- `lib/rooms.js`: salas e participantes em memória (sala vazia é apagada). `lib/signaling.js`: eventos `room:create`, `room:join`, `room:leave`, `signal`. `lib/validation.js`: validação de código, nome e mensagens. `lib/rateLimit.js`, `lib/security.js`, `lib/config.js`.
- `public/js/socket.js`: cliente Socket.IO. `peers.js`: WebRTC (negociação perfeita, fila por participante, reinício de ICE). `call.js`: ciclo da chamada, controles, compartilhamento de tela, reconexão. `media.js`, `settings.js`, `store.js`, `ui.js`; `public/app.js`: rotas e página Início.
- Nada de áudio/vídeo passa pelo servidor nem é gravado. Códigos de sala: 10 caracteres aleatórios criptográficos (≈2^50 combinações). Salas existem só enquanto há alguém nelas, e "salas recentes" ficam apenas no navegador.

### Sobre os erros do projeto anterior
Eu não tive acesso ao código anterior, então não pude apontar a linha exata que falhava. Os três erros têm a mesma família de causa (usar o socket antes de ele existir/conectar) e foram eliminados por construção: `getSocket()` lança um erro claro se o cliente não foi iniciado; `waitForConnection()` só resolve após o evento `connect` (com tempo limite e botão "Tentar novamente"); toda chamada ao servidor passa por `request()`, que aguarda a conexão e trata *timeout*. Há testes automatizados para esses cenários (`tests/client-socket.test.js`). Se você ainda vir esses erros, me envie o texto exato e o arquivo antigo.

## 4. Testes automatizados

`npm test` (ou `TESTAR-CONNECTA-WEB.bat`) cobre: validação, criação/entrada/saída de salas, códigos inválidos, lotação, rejeição de sinais de quem não pertence à sala, limpeza de salas vazias, desconexões, limite de requisições, cliente Socket.IO e, **após `npm install`**, servidor/HTTP/Socket.IO reais (`tests/server.test.js`). `npm run check` verifica a sintaxe de todos os arquivos.

## 5. Roteiro de teste manual (ponta a ponta)

1. Inicie o servidor e abra http://localhost:3000.
2. Digite um nome e clique em **Criar sala**; permita câmera e microfone.
3. Em Início, copie o link de convite.
4. Abra o link em outro navegador/aba anônima ou em outro dispositivo (no celular, a mesma rede e HTTPS são necessários, veja a seção 6; `localhost` só funciona no próprio computador).
5. Informe outro nome e **Entrar na sala**; permita câmera/microfone.
6. Confirme que cada lado vê e ouve o outro (use fones para evitar eco).
7. Desligue/religue microfone e câmera; confirme o efeito do outro lado.
8. Clique em **Compartilhar tela**; confirme que o outro lado vê; clique em **Parar compartilhamento** e confirme a volta da câmera.
9. Clique em **Sair**; confirme que o outro participante vê a saída.
10. Entre novamente com o código e verifique se a conexão volta.
11. Teste erros: código errado, sala lotada (reduza `MAX_PARTICIPANTS=2`), permissão negada, servidor parado durante a chamada (deve aparecer "tentando reconectar").

Duas abas no mesmo computador ajudam, mas **não substituem** testes entre dispositivos e redes diferentes.

## 6. Publicação na internet

Use um serviço que rode Node.js com WebSocket (Render, Railway, Fly.io, VPS). **Não publique como site estático**: o servidor Socket.IO precisa rodar.

1. Envie o projeto a um repositório Git (o `.gitignore` já exclui `.env` e `node_modules`).
2. Crie um *Web Service* Node: build `npm install`, start `npm start`, health check `/healthz` (há um `render.yaml` de exemplo).
3. Defina `TRUST_PROXY=true`, `NODE_VERSION` (18+), `MAX_PARTICIPANTS` e as variáveis TURN. A porta vem de `PORT` (a hospedagem define).
4. **HTTPS é obrigatório** para câmera/microfone fora de `localhost`; Render/Railway/Fly fornecem certificado automático e domínio próprio configurável no painel (aponte um CNAME).
5. Configure um serviço TURN (Metered, Twilio, Cloudflare Calls, ou coturn próprio em VPS) e coloque URLs/credenciais nas variáveis.
6. **Custos:** planos gratuitos de hospedagem costumam "adormecer" por inatividade e têm limites; TURN costuma ser cobrado por tráfego. Valores mudam: confira nos sites dos provedores.
7. **Falhas de WebSocket:** verifique `/healthz`; olhe o console do navegador (F12) e os logs; confirme que o proxy permite *upgrade* de WebSocket; se `ALLOWED_ORIGINS` for usado, inclua o domínio exato (com `https://`).

Este projeto **não foi publicado**; nenhum endereço público existe.

## 7. Limitações conhecidas

- Chamadas, mídia, tela e redes reais não validados (ver seção 5). O teste de integração com Express/Socket.IO reais não foi executado no ambiente de desenvolvimento (sem rede para `npm install`).
- `package-lock.json` não foi gerado (exige internet); o `npm install` do `.bat` cria o arquivo. Versões usadas: `^` em `package.json`.
- Malha P2P (cada pessoa envia para todas): ideal até ~6 participantes; salas maiores exigem SFU.
- Salas ficam em memória: reiniciar o servidor encerra todas; funciona com **uma** instância (sem escala horizontal).
- Alterar câmera/microfone em Configurações vale na próxima entrada; o outro lado não vê ícone de "mudo" do participante (câmera desligada aparece como quadro preto).
- Sem TURN, algumas redes não conectarão. Sem chat, sem gravação (por escolha).
- A imagem de referência do Conecta Web não chegou a mim; a identidade visual segue a descrição textual (tema escuro azul-marinho/preto, gradientes roxo/azul, cartões arredondados). Envie a imagem para ajustar.
