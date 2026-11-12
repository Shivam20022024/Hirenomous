@echo off
title HirePilot AI Launcher
echo ========================================================
echo         Launching HirePilot AI Recruiter
echo ========================================================
echo.

echo Starting Backend API (port 8001)...
start "HirePilot Backend (FastAPI :8001)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload"

timeout /t 3 /nobreak >nul

echo Starting Frontend UI (port 3000)...
start "HirePilot Frontend (Next.js :3000)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ========================================================
echo Both servers are starting up!
echo - Backend API:  http://127.0.0.1:8001
echo - Swagger Docs: http://127.0.0.1:8001/docs
echo - Frontend App: http://localhost:3000
echo ========================================================
echo.
pause

