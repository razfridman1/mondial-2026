# FC26 — Git fix script
# Run this once from the project folder in PowerShell or Command Prompt:
#   cd "C:\Users\razfr\Documents\Claude\Projects\MONDIAL 2026"
#   .\git-fix.ps1

Set-Location "C:\Users\razfr\Documents\Claude\Projects\MONDIAL 2026"

Write-Host "Removing git lock file..." -ForegroundColor Yellow
Remove-Item -Force -ErrorAction SilentlyContinue ".git\index.lock"

Write-Host "Staging all changes..." -ForegroundColor Yellow
git add -A

Write-Host "Committing..." -ForegroundColor Yellow
git commit -m "Purple theme, assists fix, Hebrew goal names, lineups to modal only"

Write-Host "Pushing to main..." -ForegroundColor Yellow
git push origin main

Write-Host "Done! Check Vercel for the deployment." -ForegroundColor Green
