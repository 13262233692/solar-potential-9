@echo off
echo ========================================
echo  Solar Potential Assessment System
echo  ========================================
echo.
echo  Starting both backend and frontend...
echo.

echo [1/2] Starting backend server (port 5000)...
start "Backend Server" cmd /k "cd backend && run.bat"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend server (port 8080)...
start "Frontend Server" cmd /k "cd frontend && run.bat"

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo  Services started!
echo ========================================
echo.
echo  Backend API:  http://localhost:5000
echo  Frontend:     http://localhost:8080
echo.
echo  Press any key to open browser...
pause >nul

start http://localhost:8080

echo.
echo  Browser opened! Enjoy using the system.
echo.
