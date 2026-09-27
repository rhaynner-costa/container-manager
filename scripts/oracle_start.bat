@echo off
:: Verifica privilégios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (echo [ERRO] Execute como Administrador! & timeout /t 5 & exit)

echo Iniciando Servicos Oracle...
echo ---------------------------------------

:: Sequencia de Start do Oracle conforme solicitado
net start "OracleServiceORCL"
net start "OracleOraDb11g_home1_32bitTNSListener"
net start "OracleOraDb11g_home1_32bitClrAgent"
net start "OracleMTSRecoveryService"
net start "OracleJobSchedulerORCL"
net start "OracleVssWriterORCL"

echo ---------------------------------------
echo Banco Oracle pronto.
echo.

:: --- PERGUNTA 1: WTA ---
echo Deseja iniciar o WTA ? [S,N]
choice /C SN /T 20 /D N /M "Escolha (S/N):"

if errorlevel 2 (
    echo [SKIPPED] WTA nao foi iniciado.
) else (
    echo [OK] Iniciando WinThor...
    net start "WinThor"
)

echo.

:: --- PERGUNTA 2: Integracao WSH ---
echo Deseja iniciar o WSH e agora? [S,N]
choice /C SN /T 10 /D N /M "Escolha (S/N):"

if errorlevel 2 (
    echo [SKIPPED] WSH nao foi iniciado.
) else (
    echo [OK] Iniciando winthor-integracao-core...
    net start "winthor-integracao-core"
)

:: --- FINALIZACAO ---
echo ---------------------------------------
echo Processo concluido!
echo Esta janela fechara em 5 segundos...
timeout /t 5
exit