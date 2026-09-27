@echo off
title Container Manager [DEV]
cd /d "%~dp0"
echo.
echo  Modo desenvolvimento
echo  Backend:  http://localhost:3210
echo  Frontend: http://localhost:5173
echo.
npm run dev
