# FC26 — Git fix script
# Run from PowerShell in the project folder:
#   cd "C:\Users\razfr\Documents\Claude\Projects\MONDIAL 2026"
#   .\git-fix.ps1

Set-Location "C:\Users\razfr\Documents\Claude\Projects\MONDIAL 2026"

Write-Host "Removing git lock file..." -ForegroundColor Yellow
Remove-Item -Force -ErrorAction SilentlyContinue ".git\index.lock"
Remove-Item -Force -ErrorAction SilentlyContinue ".git\HEAD.lock"

Write-Host "Staging changes..." -ForegroundColor Yellow
git add lib/data.ts components/Bracket.tsx

Write-Host "Committing..." -ForegroundColor Yellow
git commit -m "fix: R32/R16 fixtures verified + full bracket visual rewrite

- lib/data.ts: fix RSA/CAN order, BRA/GER times, MEX/ENG/BEL/SUI home teams,
  AUS vs EGY, USA vs BIH; fix R16 pairings to correct cross-bracket W R32-N
- components/Bracket.tsx: full rewrite as coordinate-based bracket tree with
  absolute positioning + SVG connector lines; scrolls horizontally on mobile"

Write-Host "Pushing to main..." -ForegroundColor Yellow
git push origin main

Write-Host "Done! Check Vercel for the deployment." -ForegroundColor Green
