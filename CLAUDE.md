# Instrukcija Claude: „Defektų aktai“ diegimas

Su vartotoju bendrauk **lietuviškai**. Vartotojas – Mindaugas, darbų valdytojas, ne programuotojas. Jis turi GitHub ir Supabase paskyras, prijungtas prie Claude. Tavo užduotis – įdiegti šią programėlę: Supabase + GitHub Pages. Kas įmanoma, daryk per jungtis (connectors) pats. Kas įmanoma tik vartotojo naršyklėje, parašyk jam tiksliais žingsniais.

## Kas tai

Naršyklės programėlė (PWA) techniniam inžinieriui. Ji skirta užduotims apie defektus name valdyti, nuotraukoms žymėti ir aktams su DI generuoti:

1. Defektavimo aktas (forma VP08FA).
2. Numatomų atlikti darbų aktas su kiekiais (neprivalomas).
3. Nuotraukų fiksacijos lapas.

Kodas baigtas. Patikrintas tik **demo režimu** (Playwright, kompiuterio ir telefono ekranai, DI atsakymai imituoti). Su tikru Supabase ir Claude API kodas **dar nepaleistas**.

## Architektūra (nekeisti be vartotojo sutikimo)

- **Sąsaja**: statinis HTML + vanilla JS ES moduliai, **be build žingsnio**, GitHub Pages.
- **Supabase**:
  - lentelės `tasks`, `photos`, `settings` (viena eilutė id=1, `data` jsonb);
  - privatus bucket `photos`;
  - RLS pagal paskyrą: `profiles` (role admin | user), `tasks.assigned_to` / `created_by`; paprastas vartotojas mato tik jam priskirtas užduotis, `is_admin()` mato ir skirsto visas. Nuotraukų saugykla ir `photos` seka užduoties matomumą. Nustatymai atskiri kiekvienai paskyrai (`user_settings`).
  - Visa schema yra `supabase/schema.sql`, ją galima paleisti pakartotinai.
- **DI**: Edge Function `ai` = `supabase/functions/ai/index.ts` + `prompt.js`.
  - Veiksmai: `parse_task` (iš laiško užpildo laukus) ir `generate_act` (grąžina aktus arba papildomus klausimus).
  - Claude kviečiamas per `fetch` su tool use.
  - Modelis: env `ANTHROPIC_MODEL`, numatytas `claude-sonnet-5-5`.
  - Vartotoją funkcija tikrina pati: `/auth/v1/user` su `SUPABASE_ANON_KEY` arba `SUPABASE_PUBLISHABLE_KEYS`. Todėl diegti reikia su **verify_jwt = false**.
  - `supabase/ai-function-vienas-failas.ts` – tos pačios funkcijos vieno failo versija rankiniam įklijavimui. Jei keiti `prompt.js` arba `index.ts`, ją sugeneruok iš naujo.
- **Keli vartotojai**: pirma paskyra tampa admin, kitos – darbuotojai. Registracija išjungta, paskyros kuriamos rankiniu būdu Supabase (Authentication → Users). Užduotį sukūręs automatiškai tampa jos atsakingu; admin perskiria užduoties kortelėje.
- `js/config.js`: `SUPABASE_URL` ir `SUPABASE_ANON_KEY` (tinka publishable `sb_publishable_...` arba legacy anon). Kol tuščia, veikia demo režimas (IndexedDB).
- Supabase klientas: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm` (`js/data.js`).

## Diegimo eiga

### A. Supabase (per Supabase jungtį)

1. Paklausk, ar kurti naują projektą, ar naudoti esamą. Naujam projektui rinkis **ES regioną** (eu-central-1), nes saugomi gyventojų kontaktai. Prieš kurdamas projektą, parodyk kainą ir gauk patvirtinimą.
2. Įvykdyk `supabase/schema.sql`: `apply_migration`, pavadinimas `init_schema`. Patikrink, kad yra lentelės, RLS politikos ir bucket `photos`. Gali paleisti `get_advisors` (security).
3. Įdiek Edge Function `ai`: failai `index.ts` ir `prompt.js` iš `supabase/functions/ai/`, `verify_jwt: false`, entrypoint `index.ts`.
4. Gauk projekto URL ir publishable (arba anon) raktą. Įrašyk juos į `js/config.js`.

### B. Ką vartotojas daro Supabase naršyklėje

Tai tavo jungtimi dažniausiai nepadaroma, todėl parašyk jam aiškiai:

1. **Edge Functions → Secrets → Add new secret**: `ANTHROPIC_API_KEY` = jo Claude API raktas iš platform.claude.com (Settings → API keys; Billing – reikia kreditų).
   - **Niekada neprašyk rakto įklijuoti į pokalbį.** Niekada nedėk jo į kodą ar GitHub.
2. **Authentication → Users → Add user → Create new user**, pažymėti **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: išjungti **Allow new users to sign up**.
4. Kai bus žinomas Pages adresas: **Authentication → URL Configuration → Site URL** = Pages adresas.

### C. GitHub (per GitHub jungtį)

1. Sukurk repozitoriją `defektai`.
   - Viešą, nebent vartotojas nori privačios. Privačiam Pages reikia mokamo plano.
   - Duomenų repo nėra, `config.js` raktai yra vieši (juos saugo RLS).
2. Įkelk **visus** failus į šaknį (`index.html` – repo šaknyje), įskaitant `.nojekyll` ir užpildytą `js/config.js`.
3. Įjunk GitHub Pages: šaka `main`, `/ (root)`. Jei jungtis to neleidžia, vartotojas daro: **Settings → Pages → Deploy from a branch → main / root → Save**.
4. Neprivaloma: `.github/workflows/deploy-ai-function.yml` automatiškai diegia funkciją. Jam reikia repo paslapčių `SUPABASE_ACCESS_TOKEN` ir `SUPABASE_PROJECT_REF`. Pasiūlyk, bet nedaryk be sutikimo.

### D. Patikrinimas su vartotoju

1. Atidaryti Pages adresą, prisijungti. Neturi būti geltonos juostos „DEMO režimas“.
2. **Nustatymai**: vardas, pareigos, organizacija, akto Nr. prefiksas ir numeris, komisija, parašas.
3. **Nauja** → įklijuoti laišką → **Užpildyti laukus**. Tai patikrina `parse_task`.
4. Įkelti nuotrauką, pažymėti, aprašyti → **Aktai** → **Generuoti su DI** → **Spausdinti / PDF**.
5. Jei klaida, žiūrėk Edge Function logus (`get_logs`, service `edge-function`) ir taisyk.

## Ką verta patikrinti pirmiausia (neištestuota realiai)

- Ar `supabase.functions.invoke('ai')` su publishable raktu ir vartotojo sesija praeina auth patikrą funkcijoje.
- Ar Anthropic API pasiekia Supabase signed URL nuotraukas (`image` blokas su `source.type: "url"`). Jei ne, funkcijoje parsisiųsk paveikslėlį ir siųsk `base64`.
- Ar `claude-sonnet-5-5` grąžina `tool_use` blokus su `tool_choice: auto`. Jei negrąžina, `extractToolInput` bando išparsinti JSON iš teksto.
- jsdelivr `+esm` supabase-js versijos įkėlimas.

## Taisyklės

- Sąsajos tekstai ir aktai – lietuviškai.
- Aktų formų struktūros ir mato vienetų sąrašo (`UNITS` faile `prompt.js` – įmonės sistemos vienetai) nekeisk be vartotojo sutikimo.
- DI elgesys (promptai) yra tik `supabase/functions/ai/prompt.js`.
- Prieš mokamus veiksmus ar duomenų trynimą – klausk.
- Baigęs pateik trumpą santrauką: programėlės adresas, kas padaryta, ką vartotojui dar liko padaryti.

## Failų žemėlapis

| Failas | Paskirtis |
|---|---|
| `index.html`, `css/app.css`, `css/print.css` | karkasas, stiliai, A4 spausdinimas |
| `js/app.js` | maršrutai, užduočių sąrašas, forma, nustatymai, prisijungimas |
| `js/task.js` | užduoties kortelė: info, nuotraukos, apžiūra (diktavimas), aktai, DI klausimai |
| `js/annotator.js` | nuotraukų žymėjimas (canvas, vektorinės žymos) |
| `js/print.js` | aktų PDF vaizdas |
| `js/data.js` | duomenų sluoksnis (Supabase / demo IndexedDB) |
| `supabase/schema.sql` | DB schema |
| `supabase/functions/ai/` | Edge Function + DI promptai |
| `README.md` | diegimo instrukcija vartotojui |
