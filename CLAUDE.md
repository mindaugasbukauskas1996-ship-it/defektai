# Defektų aktai – projekto atmintinė (Claude)

Su vartotoju bendrauk **lietuviškai**. Vartotojas – Mindaugas, darbų valdytojas, **ne programuotojas**: aiškink paprastai, kas padaryta ir ką jam liko padaryti. Sąsajos tekstai ir aktai – lietuviškai.
Šis failas – projekto „atmintis“: perskaityk jį prieš pradėdamas darbą. Vartotojų istorijos ir planas: `docs/VARTOTOJU-ISTORIJOS.md`.

## Kas tai
Naršyklės programėlė (PWA) daugiabučių techniniams inžinieriams: užduotys (defektai, rangovų neatitiktys), nuotraukų žymėjimas, aktai su DI (Claude), peržiūra su redagavimu, PDF ir Word eksportas. Keli darbuotojai, vienas admin.

Aktų tipai: **defektavimo aktas** (forma VP08FA), **numatomų darbų aktas** (su kiekiais, neprivalomas), **nuotraukų fiksacijos lapas**, **neatikties aktas** (rangovo darbų neatitiktys), **metinės (kasmetinės) apžiūros aktas** (`kind = 'annual'`, žr. žemiau).

## Adresai ir prieigos
- Programėlė: https://mindaugasbukauskas1996-ship-it.github.io/defektai/ (GitHub Pages, repo `mindaugasbukauskas1996-ship-it/defektai`, vieša, šaka `main`, šaknis).
- Supabase projekto ref: `jootkekxpxclbfughmpi` (URL ir publishable raktas – `js/config.js`, jie vieši pagal paskirtį; saugo RLS).
- **Vietinis šaltinis (tiesa): `C:\Users\mindaugas.bukauskas\OneDrive - CSG\Desktop\Aktavimas\defektai_1\defektai`.** **Aplankas yra Git repozitorija** (`origin` = GitHub repo, šaka `main`): Git ir `gh` įdiegti be admin teisių į `%LOCALAPPDATA%\Programs\Git\cmd` ir `%LOCALAPPDATA%\Programs\gh\bin` (PATH – naudotojo; naujame lange `git`/`gh` veikia, senuose galioja `$env:Path += ";$env:LOCALAPPDATA\Programs\Git\cmd;$env:LOCALAPPDATA\Programs\gh\bin"`). `gh` prisijungta kaip `mindaugasbukauskas1996-ship-it`.
- Duomenų failai (NE repozitorijoje, yra gyventojų/objektų duomenų): `Aktavimas\objektai-info.csv`, `Aktavimas\pranesimai-tomas.csv`.
- Prijungtos jungtys: Supabase, Claude in Chrome (GitHub prisijungęs vartotojo Chrome), Vercel/Gmail (nenaudojama).

## Architektūra (nekeisti be vartotojo sutikimo)
- **Sąsaja**: statinis HTML + vanilla JS ES moduliai, **be build žingsnio**, GitHub Pages.
- **Supabase**: Postgres + Auth + Storage (privatus bucket `photos`) + Edge Function `ai`.
- **Demo režimas** (kai `config.js` tuščias): IndexedDB, be paskyrų/objektų/pranešimų.
- Supabase klientas: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm`. Word: `docx@8.5.0` iš jsDelivr (kraunama tik eksportuojant).

### Failų žemėlapis
| Failas | Paskirtis |
|---|---|
| `index.html`, `css/app.css`, `css/print.css` | karkasas, stiliai, A4 spausdinimas, redagavimo stiliai peržiūroje |
| `js/app.js` | maršrutai, prisijungimas, užduočių sąrašas, užduoties/neatikties forma, objekto ir pranešimo pasirinkimas, Nustatymai (paskyros, importas, DI taisyklės) |
| `js/task.js` | užduoties kortelė: info + pastatas, nuotraukos, apžiūra (diktavimas), aktai (defektų, neatikties), DI klausimai, akto redaktorius, Word mygtukai |
| `js/print.js` | A4 peržiūra su **redagavimu vietoje** (`data-b="..."` laukai saugomi automatiškai), spausdinimas |
| `js/docx.js` | Word (.docx) generavimas (docx biblioteka) |
| `js/annotator.js` | nuotraukų žymėjimas (canvas) |
| `js/data.js` | **visas duomenų sluoksnis** (Supabase / demo): užduotys, nuotraukos, nustatymai, paskyros, objektai, kodai, pranešimai, DI taisyklės, `ai()` |
| `js/util.js` | pagalbinės: adresų skaidymas (`splitAddress`, `normKey`), CSV skaitytuvai (`parseCsv`, `parseReports`), `buildingSummary` |
| `supabase/schema.sql` | pilna idempotentiška schema (galima paleisti iš naujo) |
| `supabase/functions/ai/prompt.js` | **visi DI nurodymai** ir užklausų formavimas; `index.ts` – funkcijos apvalkalas |
| `supabase/ai-function-vienas-failas.ts` | tos pačios funkcijos vieno failo versija (generuojama; žr. žemiau) |

### Duomenų modelis (Supabase)
- `tasks` – užduotys: `kind` (`defect`/`nonconformity`), adresas, kontaktai, `field_notes`, `defect_act`/`works_act`/`nc_act` (jsonb), `act_mode` (`defect`/`full`), `act_detail` (`narrow`/`medium`/`wide`), `assigned_to`, `created_by`, `object_id`, `report_no`, `contractor`, `act_number`…
- `photos` (+ bucket `photos`; aplanko pavadinimas = užduoties id), `user_settings` (nustatymai **kiekvienai paskyrai**; senoji `settings` lentelė nebenaudojama, be politikų), `profiles` (`role` admin/user, **`active`**), `ai_lessons` (DI išmoktos taisyklės), `objects` (791 pastatas su stogo/konstruktyvo/plotų info), `stair_codes` (~2000 laiptinių kodų), `reports` (inžinieriaus pranešimai pagal registracijos Nr.).
- **Saugumas (RLS)**: visa prieiga tik `authenticated` **ir aktyviai** paskyrai (`is_active()`); paprasta paskyra mato tik jai priskirtas užduotis / pranešimus; admin (`is_admin()`) mato ir skirsto viską. Naujos paskyros **neaktyvios**, kol admin neaktyvuoja (Nustatymai → Paskyros). DI funkcija irgi tikrina aktyvumą. Rolės/aktyvumo keisti gali tik admin.

### Metinė apžiūra (`js/annual.js`)
- Maršrutas `#/metine`: visų objektų sąrašas su filtrais (neapžiūrėti / apžiūrėti šiemet, vadybininkas), „Pradėti“ sukuria užduotį `kind='annual'` su `annual_act` (jsonb): `general` (adresas, unikalus Nr., metai, plotas, paskirtis, vadovas, kategorija, pagrindas, metodas, data), `sections[].items[]` (`id,no,name,str,status ok|defects|skip,brief,text,prev,keep`), `conclusions[]`.
- Akto Nr.: `<prefiksas>-<gatvės raidė>-<namo nr.>` (pvz. MBB-K-9; prefiksas ir kv. atestato Nr. – Nustatymuose).
- Šablonas (`ANNUAL_TEMPLATE`) pagal 2026-05 pavyzdį: 1 Laikančios konstrukcijos / atitvarai, 2 Durys / langai, 3 Inžinerinės sistemos, 4 Kiti. Atskiras akto elementas gali būti pridėtas kiekvienoje apžiūroje (`x_` id); šablono redagavimo ekrano dar nėra.
- Greita lentelė (`apziura` skiltis): „Defektų nėra / Yra defektų / Praleisti“, diktavimas, nuotraukos prie elemento (`photos.ref`), praėjusių metų tekstas („Naudoti kaip pernai“). Aktas (`aktai` skiltis): DI generavimas, tekstų redagavimas, peržiūra (`doc = 'annual'`), Word.
- DI: **atskira Edge funkcija `ai-annual`** (`supabase/functions/ai-annual/index.ts`, `verify_jwt=false`, tikrina aktyvumą). Klientas: `db.aiAnnual`. Funkcijos diegimas reikalauja vartotojo leidimo (klasifikatorius atmeta).

### DI (Edge Function `ai`, `verify_jwt = false`, vartotoją tikrina pati)
Veiksmai: `parse_task` (laiškas → laukai), `generate_act` (defektų + numatomų darbų aktai arba klausimai), `generate_nc` (neatikties aktas). Gauna: užduotį, nuotraukas (su žymėjimais), `detail` (išsamumas), `building` (pastato kontekstas iš `objects`), `lessons` (vartotojo išmoktos taisyklės). Atsakyme gali būti `lesson` – bendra taisyklė iš „Pataisyti su DI“ nurodymo; ji saugoma `ai_lessons`. Modelis: env `ANTHROPIC_MODEL`, numatytas `claude-sonnet-5-5`. `ANTHROPIC_API_KEY` – tik Supabase paslaptyse, **niekada** ne kode/pokalbyje.

## Diegimo procedūra (kaip viską išleisti)
1. **DB pakeitimai**: Supabase jungtis `apply_migration` (pavadinimas snake_case) + tą patį įrašyti į `supabase/schema.sql`. Po RLS pakeitimų patikrinti su imituotais vaidmenimis (`set local role authenticated` + `request.jwt.claims`).
2. **DI funkcija**: pakeitus `prompt.js`/`index.ts` → sugeneruoti vieno failo versiją (antraštė + `prompt.js` + `index.ts` be `import ... from './prompt.js'`) ir `deploy_edge_function` (name `ai`, entrypoint `index.ts`, `verify_jwt:false`, vienas failas `index.ts`). **Šį veiksmą saugos klasifikatorius gali atmesti – tada paprašyti vartotojo aiškaus leidimo.**
3. **Sąsaja** (Git): `git add -A` → `git commit -m "trumpas aprašas"` → `git push` (šaka `main`). Pages atsinaujina per ~30 s. Prieš tai `git status`/`git diff`, kad matytųsi, kas keičiasi. Repo viešas – **niekada nekomituoti** CSV su duomenimis, paslapčių, `.env` (`.gitignore` tai dengia). Atsarginis būdas, jei Git neveiktų: įkelti per Claude in Chrome (`.../upload/main/<aplankas>` → `file_upload` → „Commit changes“; failai turi būti darbo aplanke).
4. **Patikra gyvai**: palaukti ~30 s (Pages), tada naršyklės konsolėje `fetch('/defektai/js/x.js',{cache:'reload'})` visiems moduliams ir `location.reload()` – naršyklė iki 10 min. laiko senus modulius. JS įrankio išvestyje venk `=` ir `&` (blokuoja kaip „query string“).
5. Dideli vienkartiniai duomenys (objektai, kodai, pranešimai) importuojami per **Nustatymai → Objektai ir laiptinių kodai** (admin), ne per SQL.

## Duomenų formatai
- **Objektų CSV**: be antraštės arba su, `;`; 18 stulpelių (adresas; vadybininkas; projektas; butai; **aukštai**; konstruktyvas; *(nenaudojamas)*; laiptinės; naud. plotas; plotas; rūsys; renovacija; metai; stogo būklė; stogo danga; stogo plotas; stogo tipas; šilumos punktas) arba 16 (be aukštų ir nenaudojamo). Adresas: `Gatvė   NR, Miestas`; kaimuose `Gatvė NR, Kaimas, Seniūnija, Rajonas` (miestas = po pirmo kablelio). Nuliai = „nenurodyta“.
- **Laiptinių kodai**: `Miestas;Gatvė;Namo nr.;Laiptinė;Kodas` (šaltinis – viešas repo `laiptiniu-kodai`, mygtukas importuoja iš jo). Importas pakeičia visą sąrašą.
- **Pranešimai**: be antraštės, `;`, aprašymai su eilučių lūžiais ir `;`. Įrašo pradžia `V26-0000000;YYYY-MM-DD HH:MM;`. 26 stulpeliai; 27 – gale kontaktinio asmens vardas; 28 – dar „N laiptinė“. Aprašymas = viskas tarp 8 pirmųjų ir paskutinių 17/18/19 laukų. Pakartotinis importas atnaujina pagal registracijos Nr.

## Taisyklės
- Aktų formų struktūros ir mato vienetų sąrašo (`UNITS` faile `prompt.js` – įmonės sistemos vienetai) nekeisti be vartotojo sutikimo.
- DI elgesys – tik `supabase/functions/ai/prompt.js`.
- Prieš mokamus veiksmus ar duomenų trynimą – klausti. Neprašyti ir nesiųsti paslapčių į pokalbį.
- PowerShell: dvigubose kabutėse **lietuviškos kabutės „ “ laužo eilutę** – naudoti `@' '@` here-string arba Edit įrankį.
- Prieš didesnius pakeitimus nuskaityti dabartinius failus; po pakeitimų patikrinti gyvai (konsolė be klaidų, pagrindinis scenarijus).

## Žinomi trūkumai / reikia vartotojo
- Supabase **„Allow new users to sign up“ turi būti išjungta** (patikrinti: `/auth/v1/settings` → `disable_signup`). Papildoma apsauga (aktyvavimas) jau yra.
- Claude kreditų išlaidų limitas platform.claude.com; atsarginės kopijos (nemokamas planas jų nedaro); vieša `laiptiniu-kodai` repo atskleidžia kodus.
- Pranešimo „prioriteto“ kodas (1/2/3) neperkeltas į užduoties prioritetą – neaišku reikšmė.
- Nėra automatinių testų. Git istorija prasideda nuo 2026-10 (anksčiau failai keliami per naršyklę). `.git` yra OneDrive aplanke – jei OneDrive skųstųsi sinchronizacija, perkelti darbo kopiją į atskirą aplanką.
- Pastato duomenys pildomi tik importu (nėra redagavimo ekrano).
