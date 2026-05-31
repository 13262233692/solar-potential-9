@echo off
echo ========================================
echo  Solar Potential Assessment - Backend
echo ========================================
echo.

echo Checking Python...
python --version
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH
    pause
    exit /b 1
)

echo.
echo Installing dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Starting backend server...
echo Server will be available at http://localhost:5000
echo Press Ctrl+C to stop
echo.

python app.py
