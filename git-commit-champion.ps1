# Delete stale git lock if present
$lock = ".git\index.lock"
if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host "Removed index.lock" }

git add -A
git commit -m "Add champion pick + 12pt bonuses for scorer/assist/champion picks

- lib/special-picks-bonus.ts: computeSpecialPickBonuses (12pts each)
- app/api/top-picks/route.ts: champion pick, locked at R16 complete
- app/api/top-picks/all/route.ts: champion column in all-picks table
- app/api/cron/snapshot-leaderboard/route.ts: compute special bonuses
- components/TopScorersTab.tsx: champion picker UI + AllPicksTable column
- lib/store.ts: setTopPicks with optional champion arg
- lib/types.ts: championPick in Profile
- components/ScoringLegend.tsx: 12pt bonus entries"

git push origin main
Write-Host "Done!"
