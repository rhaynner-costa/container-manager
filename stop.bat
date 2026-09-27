@echo off
echo.
echo  Encerrando Container Manager...
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3210 " ^| findstr "LISTENING"') do (
  echo  Matando processo na porta 3210 (PID %%a)
  taskkill /PID %%a /F >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
  echo  Matando processo na porta 5173 (PID %%a)
  taskkill /PID %%a /F >nul 2>&1
)

echo  Pronto.
echo.
