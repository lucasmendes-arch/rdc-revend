@echo off
REM Script para fazer deploy da edge function sync-nuvemshop
REM Uso: deploy.bat <seu-access-token-supabase>

setlocal enabledelayexpand

set "PROJECT_REF=kjfsmwtwbreapipifjtu"
set "FUNCTION_NAME=sync-nuvemshop"

echo 🚀 Supabase Edge Function Deploy - sync-nuvemshop
echo ==================================================
echo.

REM Verificar se token foi fornecido
if "%~1"=="" (
    echo ❌ Erro: Access token do Supabase nao foi fornecido
    echo.
    echo Como obter o token:
    echo 1. Acesse: https://app.supabase.com/account/tokens
    echo 2. Crie um novo 'Personal' token
    echo 3. Copie o token
    echo.
    echo Uso:
    echo   deploy.bat ^<seu-access-token^>
    echo.
    echo Exemplo:
    echo   deploy.bat sbp_xxxxxxxxxxxxxxxxxxxxx
    echo.
    exit /b 1
)

REM Configurar token
set "SUPABASE_ACCESS_TOKEN=%~1"

echo ✅ Token configurado
echo.

REM Linkar ao projeto
echo 🔗 Linkando ao projeto Supabase...
call npx supabase link --project-ref !PROJECT_REF!

if %ERRORLEVEL% neq 0 (
    echo ❌ Erro ao linkar ao projeto
    exit /b 1
)

echo.
echo 📤 Fazendo deploy da edge function '!FUNCTION_NAME!'...
call npx supabase functions deploy !FUNCTION_NAME!

if %ERRORLEVEL% neq 0 (
    echo ❌ Erro no deploy
    exit /b 1
)

echo.
echo ✅ Deploy concluido com sucesso!
echo.
echo Próximos passos:
echo 1. Acesse: https://app.supabase.com/project/!PROJECT_REF!/functions
echo 2. Verifique que a funcao '!FUNCTION_NAME!' esta ativa
echo 3. Configure os Secrets se ainda nao fez:
echo    - NUVEMSHOP_STORE_ID
echo    - NUVEMSHOP_USER_AGENT
echo    - NUVEMSHOP_ACCESS_TOKEN
echo.
echo 💡 Tip: Voce pode remover o token desta sessao fechando este terminal
echo.

endlocal
