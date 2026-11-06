# Sugeneruoja supabase/ai-function-vienas-failas.ts iš functions/ai/prompt.js + index.ts (be import eilutės).
# Paleisti iš projekto šaknies: powershell -File supabase\build-single.ps1
$enc = New-Object Text.UTF8Encoding $false
$root = Split-Path -Parent $PSScriptRoot
$prompt = [IO.File]::ReadAllText("$root\supabase\functions\ai\prompt.js", [Text.Encoding]::UTF8)
$index = [IO.File]::ReadAllText("$root\supabase\functions\ai\index.ts", [Text.Encoding]::UTF8)
$index = ($index -split "`r?`n" | Where-Object { $_ -notmatch "^import .* from './prompt.js';" }) -join "`n"
$header = @'
// =====================================================================
// VIENO FAILO VERSIJA Supabase naršyklės redaktoriui (Edge Functions -> Via Editor).
// Šis failas sugeneruotas iš supabase/functions/ai/prompt.js + index.ts.
// Įklijuokite VISĄ turinį į funkcijos "ai" failą index.ts ir spauskite Deploy.
// =====================================================================

'@
$out = $header + ($prompt -replace "`r`n", "`n") + "`n`n" + $index
[IO.File]::WriteAllText("$root\supabase\ai-function-vienas-failas.ts", $out, $enc)
"Sugeneruota: " + $out.Length + " simbolių"
