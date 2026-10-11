@echo off
rem Double-clic : lance le jeu et l'ouvre dans le navigateur par defaut.
cd /d "%~dp0"
title Bateau - serveur du jeu

if not exist node_modules (
  echo Premiere utilisation : installation des dependances...
  call npm install
)

rem Si le jeu tourne deja (par exemple lance par Claude), on ouvre juste le navigateur.
curl -s -o nul --max-time 2 http://localhost:5173
if %errorlevel%==0 (
  start "" http://localhost:5173
  exit /b
)

echo.
echo  Le jeu va s'ouvrir dans ton navigateur.
echo  Garde cette fenetre ouverte pendant que tu joues.
echo  Ferme-la pour arreter le jeu.
echo.
call npm run dev -- --open
