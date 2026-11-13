@echo off
title Hirenomous AI Launcher
echo ========================================================
echo         Launching Hirenomous AI Recruiter
echo ========================================================
echo.

echo Cleaning up previous instances on ports 8001 and 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

echo Starting Backend API (port 8001)...
start "Hirenomous Backend (FastAPI :8001)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"

ping 127.0.0.1 -n 3 >nul

echo Starting Frontend UI (port 3001)...
start "Hirenomous Frontend (Next.js :3001)" cmd /k "cd /d %~dp0frontend && npm run dev -- -p 3001"

ping 127.0.0.1 -n 3 >nul

echo.
echo ========================================================
echo Both servers are starting up!
echo - Backend API:  http://127.0.0.1:8001
echo - Swagger Docs: http://127.0.0.1:8001/docs
echo - Frontend App: http://localhost:3001
echo ========================================================
echo.
pause
