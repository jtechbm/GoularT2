@echo off
REM ------------------------------------------------------------------
REM Rotina de sincronizacao para rodar nesta maquina pelo Agendador de
REM Tarefas do Windows, enquanto a sincronizacao nao vai para um servidor.
REM Le as lojas conectadas e atualiza o mes corrente. E seguro rodar de
REM novo: a sincronizacao regrava o mes, nao duplica nada.
REM ------------------------------------------------------------------
cd /d "%~dp0.."

REM pool pequeno: a producao divide o mesmo limite de conexoes do Supabase
set DATABASE_POOL_MAX=2

if not exist ".sync-logs" mkdir ".sync-logs"
for /f "tokens=1-3 delims=/-. " %%a in ("%DATE:~-10%") do set HOJE=%%c-%%b-%%a
set LOG=.sync-logs\%HOJE%.log

echo. >> "%LOG%"
echo ===== %DATE% %TIME% >> "%LOG%"
call npm run sincronizar >> "%LOG%" 2>&1
echo ===== fim %TIME% (codigo %ERRORLEVEL%) >> "%LOG%"
