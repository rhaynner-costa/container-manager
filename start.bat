@echo off
title Container Manager
cd /d "%~dp0"

echo.
echo  Compilando...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo  ERRO: build falhou. Verifique os erros acima.
  pause
  exit /b 1
)

echo.
echo  Iniciando Container Manager...
echo  Acesse: http://localhost:3210
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3210"
node dist\server\index.js
pause
