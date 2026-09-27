@echo off
:: Verifica privilégios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (echo [ERRO] Execute como Administrador! & timeout /t 5 & exit)

echo Parando Servicos Winthor e Oracle...
echo ---------------------------------------

:: 1. Finaliza os servicos do WTA e WSH primeiro
echo [1/2] Parando Aplicacoes Winthor...
net stop "WinThor" /y
net stop "winthor-integracao-core" /y

:: 2. Sequencia de Stop Oracle solicitada
echo [2/2] Parando Servicos Oracle...
net stop "OracleVssWriterORCL" /y
net stop "OracleJobSchedulerORCL" /y
net stop "OracleMTSRecoveryService" /y
net stop "OracleOraDb11g_home1_32bitClrAgent" /y
net stop "OracleOraDb11g_home1_32bitTNSListener" /y
net stop "OracleServiceORCL" /y

echo ---------------------------------------
echo Todos os servicos foram encerrados com sucesso!
echo Esta janela fechara em 5 segundos...
timeout /t 5
exit