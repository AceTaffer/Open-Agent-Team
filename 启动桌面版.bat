@echo off
chcp 65001 >nul
title Open Agent Team (Desktop)
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo 未找到 Electron（桌面组件未安装）。
  echo 请先在本文件夹打开命令行执行：npm install
  pause
  exit /b
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
