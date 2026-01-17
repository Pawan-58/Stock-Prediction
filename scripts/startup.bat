@echo off
call .venv\Scripts\activate.bat
python train.py
pause

call deactivate