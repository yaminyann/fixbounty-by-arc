@echo off
where forge.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    forge.exe %*
) else (
    wsl -- /home/yaminyann/.foundry/bin/forge %*
)
