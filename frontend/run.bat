@echo off
echo ========================================
echo  Solar Potential Assessment - Frontend
echo ========================================
echo.

echo Starting HTTP server on port 8080...
echo Frontend will be available at http://localhost:8080
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
python -m http.server 8080
