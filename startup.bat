@echo off
title Mini Factory Twin Launcher

REM === Initialize Conda ===
CALL "C:\Users\luked\miniconda3\Scripts\activate.bat" mft

REM === Backend ===
cd "C:\Users\luked\Documents\Projects\mini-factory-twin"
start cmd /k "CALL C:\Users\luked\miniconda3\Scripts\activate.bat mft && uvicorn main:app --reload"

REM === short pause to avoid temp-file collision ===
timeout /t 3 >nul

REM === Frontend ===
cd "C:\Users\luked\Documents\Projects\mini-factory-twin\frontend"
start cmd /k "CALL C:\Users\luked\miniconda3\Scripts\activate.bat mft && npm run dev"

REM === Open browser ===
start http://localhost:5173/

echo Mini Factory Twin stack launched successfully!
pause
