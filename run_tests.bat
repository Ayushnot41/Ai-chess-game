@echo off
cd /d "%~dp0"
echo ========================================================
echo   RUNNING GRANDMASTER-AI COMPREHENSIVE TEST SUITE
echo ========================================================
python -m pytest tests --rootdir=tests -v
pause
