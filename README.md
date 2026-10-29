# Defektų aktai

Naršyklės programėlė techniniam inžinieriui: užduotys, defektų fiksavimas nuotraukose ir aktų rengimas su DI (Claude).

Veikia kompiuteryje ir telefone. Telefone ją galima „įdiegti“ kaip programėlę (Chrome → ⋮ → *Įdiegti programą* / Safari → *Bendrinti* → *Į pradžios ekraną*).

## Ką moka

- **Užduotys**: adresas, laiptinė, laiptinės kodas, butas, kontaktai, problema, paslauga, prioritetas, terminas, būsena (Nauja → Suplanuota → Apžiūrėta → Aktas paruoštas → Baigta).
- **Greitas užpildymas su DI**: įklijuojate gyventojo laišką, o DI pats užpildo adresą, telefoną, laiptinę ir problemą.
- **Telefone vietoje**: mygtukai *Skambinti*, *Navigacija*, didelis laiptinės kodas; fotografavimas tiesiai kamera; aprašymą galima **diktuoti balsu** (Chrome / Android).
- **Nuotraukų žymėjimas**: stačiakampis, elipsė, rodyklė, laisva linija, numeruotos žymos, tekstas; 6 spalvos, 3 storiai, atšaukti/pakartoti. Žymos išsaugomos ir vėliau redaguojamos. Veikia pele ir pirštu.
- **Aktai su DI**, pasirinkus:
  - *Defektinis aktas* – defektai ir rekomenduojami darbai, be kiekių;
  - *Defektinis + numatomų darbų aktas* – papildomai darbų lentelė su mato vienetais (iš įmonės sistemos sąrašo) ir preliminariais kiekiais.
- DI mato pažymėtas nuotraukas. Jei informacijos trūksta, **užduoda klausimus** su atsakymų pasiūlymais. Galima generuoti ir nepaisant klausimų: tada DI surašo prielaidas, kurias reikia patikrinti.
- Sugeneruotą aktą galima **redaguoti** ranka arba **taisyti su DI** („pridėk pastolius“).
- **PDF / spausdinimas**: defektavimo aktas (VP08FA stiliumi, su komisijos išvada ir parašų eilutėmis), numatomų darbų aktas ir nuotraukų fiksacijos lapas. Galima įkelti parašo arba spaudo paveikslėlį.

## Architektūra

| Dalis | Kur | Kaina |
|---|---|---|
| Sąsaja (HTML/JS, be „build“ žingsnio) | GitHub Pages | nemokama |
| Duomenų bazė, nuotraukos, prisijungimas | Supabase | nemokamas planas (500 MB DB, 1 GB failų) |
| DI | Claude API per Supabase Edge funkciją | apie 0,01–0,05 € už aktą (`claude-sonnet-5-5`) |

API raktas laikomas tik Supabase serveryje, naršyklė jo nemato.

---

## Diegimas (~30 min., vieną kartą)

### 1. Supabase projektas

1. Užsiregistruokite <https://supabase.com> → **New project**. Regioną rinkitės **Europoje** (pvz., Frankfurt), nes saugomi gyventojų kontaktai.
2. **SQL Editor → New query**: įklijuokite visą `supabase/schema.sql` turinį ir spauskite **Run**.
3. **Authentication → Users → Add user**: sukurkite inžinieriaus paskyrą (el. paštas ir slaptažodis).
4. **Authentication → Sign In / Providers**: išjunkite **Allow new users to sign up**, kad niekas kitas negalėtų užsiregistruoti.
5. **Project Settings → API**: nusikopijuokite **Project URL** ir **anon / publishable key**.

### 2. Claude API raktas ir DI funkcija

1. Gaukite API raktą: <https://platform.claude.com> → API Keys. Ten pat galite nustatyti mėnesio išlaidų limitą.
2. Kompiuteryje, kuriame yra [Node.js](https://nodejs.org), atsidarykite šio projekto aplanką ir paleiskite:

```bash
npx supabase login
npx supabase link --project-ref JUSU_PROJEKTO_ID
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy ai --no-verify-jwt
```

`JUSU_PROJEKTO_ID` yra raidžių kodas iš projekto adreso (`https://JUSU_PROJEKTO_ID.supabase.co`).

> Kitas būdas be kompiuterio programų: Supabase **Edge Functions → Deploy a new function → Via Editor**. Pavadinimas `ai`, į `index.ts` įklijuokite visą failo `supabase/ai-function-vienas-failas.ts` turinį ir spauskite **Deploy**. Funkcijos nustatymuose išjunkite **Verify JWT** (vartotoją tikrina pats kodas). Raktą įrašykite **Edge Functions → Secrets**: `ANTHROPIC_API_KEY`.

Modelį galima pakeisti: `npx supabase secrets set ANTHROPIC_MODEL=claude-opus-5-5` (kokybiškiau, bet brangiau).

### 3. Konfigūracija

Faile `js/config.js` įrašykite:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://JUSU_PROJEKTO_ID.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ... arba sb_publishable_...'
};
```

Šias reikšmes galima laikyti viešai, nes duomenis saugo prisijungimas ir RLS taisyklės.

### 4. GitHub Pages

1. Sukurkite GitHub repozitoriją ir įkelkite visus failus (įskaitant `.nojekyll`).
2. **Settings → Pages → Source: Deploy from a branch**, šaka `main`, aplankas `/ (root)`.
3. Po 1–2 min. programėlė veiks adresu `https://VARTOTOJAS.github.io/REPO/`.
4. Supabase: **Authentication → URL Configuration → Site URL** nustatykite tą patį adresą.

> Privačiai repozitorijai GitHub Pages reikia mokamo plano. Viešoje repozitorijoje yra tik kodas, o duomenys lieka Supabase.

### 5. Pirmas paleidimas

Prisijunkite → **Nustatymai**: įrašykite savo vardą, pareigas, organizaciją, akto Nr. prefiksą ir kitą numerį, komisijos narius, parašo paveikslėlį. Paslaugų sąrašą ir komisijos išvados tekstą taip pat galima redaguoti.

---

## Išbandyti be diegimo (demo režimas)

Kol `js/config.js` tuščias, programėlė veikia **demo režimu**: duomenys saugomi tik naršyklėje. DI demo režime veiks, jei Nustatymuose įrašysite Anthropic API raktą (tik testavimui savo kompiuteryje).

```bash
cd defektai
python -m http.server 8000
# atidarykite http://localhost:8000
```

## Automatinis DI funkcijos atnaujinimas (neprivaloma)

`.github/workflows/deploy-ai-function.yml` įdiegia funkciją kiekvieną kartą, kai pakeičiamas `supabase/functions/`. Reikia GitHub repo paslapčių (**Settings → Secrets → Actions**): `SUPABASE_ACCESS_TOKEN` ir `SUPABASE_PROJECT_REF`.

## Kaip pakeisti DI elgesį

Visi DI nurodymai yra faile `supabase/functions/ai/prompt.js`: rašymo stilius, mato vienetų sąrašas, kada klausti, ką įtraukti į darbų lentelę. Pakeitę failą, iš naujo įdiekite funkciją (`npx supabase functions deploy ai --no-verify-jwt`). Naudojant naršyklės redaktorių, vieno failo versiją sugeneruokite iš naujo arba pakeitimą įrašykite į abu failus.

## Failų struktūra

```
index.html               – programėlės „karkasas“
css/app.css, print.css   – išvaizda ir A4 spausdinimo šablonai
js/config.js             – Supabase prisijungimo duomenys
js/app.js                – maršrutai, sąrašas, užduoties forma, nustatymai
js/task.js               – užduoties kortelė: info, nuotraukos, apžiūra, aktai
js/annotator.js          – nuotraukų žymėjimo redaktorius
js/print.js              – aktų PDF/spausdinimo vaizdas
js/data.js               – duomenų sluoksnis (Supabase arba demo)
supabase/schema.sql      – DB lentelės, saugumo taisyklės, saugykla
supabase/functions/ai/   – Edge funkcija ir DI nurodymai
```
