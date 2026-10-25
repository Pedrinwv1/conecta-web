@echo off
setlocal
title Conecta Web
cd /d "%~dp0"
echo ==========================================
echo   Conecta Web - iniciando
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Node.js nao esta instalado.
  echo Baixe a versao LTS em https://nodejs.org , instale e execute este arquivo novamente.
  goto :fim
)
node -e "process.exit(parseInt(process.versions.node)>=18?0:1)"
if errorlevel 1 (
  echo [ERRO] Seu Node.js e muito antigo. Instale a versao LTS atual em https://nodejs.org
  goto :fim
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Arquivo .env criado a partir do exemplo.
)

if not exist "node_modules\express\package.json" goto :instalar
if not exist "node_modules\socket.io\package.json" goto :instalar
goto :iniciar

:instalar
echo Instalando dependencias (somente na primeira vez, precisa de internet)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERRO] A instalacao das dependencias falhou. Verifique sua internet e tente novamente.
  goto :fim
)
if not exist "node_modules\express\package.json" (
  echo [ERRO] A instalacao terminou, mas o Express nao foi encontrado.
  goto :fim
)
if not exist "node_modules\socket.io\package.json" (
  echo [ERRO] A instalacao terminou, mas o Socket.IO nao foi encontrado.
  goto :fim
)
echo Dependencias instaladas com sucesso.

:iniciar
echo.
echo Acesse no navegador:  http://localhost:3000
echo (O navegador NAO abre sozinho: copie o endereco acima.)
echo (Se voce mudou PORT no arquivo .env, use a porta que escolheu.)
echo Para parar o servidor, pressione Ctrl+C nesta janela.
echo.
node server.js

:fim
echo.
echo O servidor foi encerrado. Pressione uma tecla para fechar esta janela.
pause >nul
endlocal
