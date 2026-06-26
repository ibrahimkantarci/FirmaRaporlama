@echo off
cd /d "%~dp0"

REM İlk çalıştırmada repo'yu kur; sonraki çalıştırmalarda atla.
if not exist ".git" (
  git init
  git branch -M main
)

REM origin yoksa ekle (varsa dokunma).
git remote get-url origin >nul 2>&1 || git remote add origin https://github.com/ibrahimkantarci/FirmaRaporlama.git

REM Commit mesajı: argüman verilirse onu kullan, yoksa "update".
set "MSG=%*"
if "%MSG%"=="" set "MSG=update"

REM -A silinen dosyaları da sahneye alır (repo'dan kaldırır).
git add -A
git commit -m "%MSG%" || echo [bilgi] Commit atlandi (degisiklik yok).
git push -u origin main

pause
