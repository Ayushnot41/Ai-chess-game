@echo off
cd /d "%~dp0"
echo ========================================================
echo   GRANDMASTER-AI: 3D CHESS PLATFORM & MOVE PREDICTOR
echo ========================================================
echo Launching FastAPI Engine Server on http://localhost:8000 ...
start "" "http://localhost:8000"
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
pause
