@echo off
setlocal enabledelayedexpansion

echo =========================================================================
echo   GRANDMASTER-AI: 100%% FREE LIVE LOCAL DEPLOYMENT (NO SIGNUP NEEDED)
echo =========================================================================
echo.

:: 1. Identify Local LAN IP for Wi-Fi devices
for /f "tokens=4" %%a in ('route print^|findstr 0.0.0.0.*0.0.0.0') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip

echo [*] Local WiFi / LAN URL : http://!LOCAL_IP!:8000
echo [*] Local Host URL       : http://localhost:8000
echo.

:: 2. Check for Cloudflared binary
if not exist "cloudflared.exe" (
    echo [*] Downloading official portable Cloudflare Tunnel binary...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', 'cloudflared.exe')"
    if not exist "cloudflared.exe" (
        echo [!] Cloudflared download failed. Falling back to localtunnel via npx...
        goto :use_localtunnel
    )
)

echo [*] Starting Grandmaster-AI FastAPI backend server...
start "Grandmaster-AI Server" /B python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000

echo [*] Establishing secure public HTTPS tunnel via Cloudflare...
echo [*] Your Live Global URL will appear below in 3-5 seconds:
echo -------------------------------------------------------------------------
cloudflared.exe tunnel --url http://127.0.0.1:8000
goto :end

:use_localtunnel
echo [*] Launching via npx localtunnel...
start "Grandmaster-AI Server" /B python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
npx localtunnel --port 8000

:end
pause
