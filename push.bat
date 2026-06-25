@echo off
cd /d "%~dp0"


git init
git branch -M main
git remote add origin https://github.com/ibrahimkantarci/FirmaRaporlama.git

git add -A
git commit -m "update"
git push

pause
