@echo off
setlocal
title Conecta Web - Testes
cd /d "%~dp0"
echo ==========================================
echo   Conecta Web - testes automatizados
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Node.js nao esta instalado. Baixe a versao LTS em https://nodejs.org
  goto :fim
)

if not exist "node_modules\socket.io-client\package.json" (
  echo Instalando dependencias (precisa de internet)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERRO] A instalacao das dependencias falhou.
    goto :fim
  )
)

echo --- Verificacao de sintaxe ---
call npm run check
if errorlevel 1 (
  echo [FALHA] Ha erros de sintaxe.
  goto :fim
)
echo.
echo --- Testes automatizados ---
call npm test
if errorlevel 1 (
  echo [FALHA] Algum teste falhou. Leia as mensagens acima.
) else (
  echo [OK] Todos os testes passaram.
)

:fim
echo.
echo Pressione uma tecla para fechar.
pause >nul
endlocal
