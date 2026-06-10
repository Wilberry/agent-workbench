# bootstrap.ps1 - Workspace Bootstrap Script for Agent Workbench

# Stop on any error
$ErrorActionPreference = "Stop"

Write-Host "`n🔹 Step 1: Verify Node.js installation..."
node -v
npm -v

Write-Host "`n🔹 Step 2: Install pnpm globally..."
npm install -g pnpm

Write-Host "`n🔹 Step 3: Verify pnpm installation..."
pnpm -v

Write-Host "`n🔹 Step 4: Install all workspace dependencies..."
pnpm install

Write-Host "`n🔹 Step 5: Initialize Husky git hooks..."
npx husky install

Write-Host "`n🔹 Step 6: Initialize Supabase local environment..."
supabase init

Write-Host "`n🔹 Step 7: (Optional) Start Supabase locally in a new PowerShell window..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "pnpm run supabase:start"

Write-Host "`n🔹 Step 8: Run the Next.js app in dev mode in a new PowerShell window..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "pnpm dev --filter web..."

Write-Host "`n🔹 Step 9: Commit all scaffolded files..."
git add .
git commit -m "Bootstrap workspace: Next.js app, Supabase placeholders, shared packages, CI and configs"

Write-Host "`n✅ Workspace bootstrap complete! Open http://localhost:3000 to view your Next.js app."
