@echo off
title Mini Factory Twin Launcher

REM === Backend (minimized) ===
start /min "MFT Backend" cmd /k "CALL C:\Users\luked\miniconda3\Scripts\activate.bat mft && cd /d C:\Users\luked\Documents\Projects\mini-factory-twin && uvicorn main:app --reload"

REM === short pause to avoid temp-file collision ===
timeout /t 3 >nul

REM === Frontend (minimized) ===
start /min "MFT Frontend" cmd /k "CALL C:\Users\luked\miniconda3\Scripts\activate.bat mft && cd /d C:\Users\luked\Documents\Projects\mini-factory-twin\frontend && npm run dev"

REM === Open browser ===
start http://localhost:5173/

echo Mini Factory Twin launched (servers minimized in taskbar)
timeout /t 2 >nul
