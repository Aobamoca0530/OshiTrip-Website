@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "OSHI_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "OSHI_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "node_modules\next\dist\bin\next" (
  echo 请先按仓库根目录 README.md 的本地运行说明安装 Node.js 和项目依赖。
  pause
  exit /b 1
)
echo OshiTrip 本地开发服务。启动后请打开终端显示的 Local 地址。
echo 关闭此窗口或按 Ctrl+C 停止服务。
"%OSHI_NODE%" node_modules\next\dist\bin\next dev --hostname 0.0.0.0
pause
