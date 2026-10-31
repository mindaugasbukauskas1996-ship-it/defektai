# Defektų aktai – vartotojų istorijos ir planas

Formatas: **Kaip** *<vaidmuo>* **noriu** *<ką>*, **kad** *<kodėl>*. Būsena: ✅ padaryta · 🟡 iš dalies · ⬜ planuojama.
Vaidmenys: **Inžinierius** (darbuotojas), **Admin**, **Rangovas** (tik gauna aktą).

## Padaryta

### Užduotys ir objektai
- ✅ Inžinierius – kurdamas užduotį pasirinkti **objektą iš sąrašo** (791), kad nereikėtų rašyti adreso; užsipildo miestas, vadybininkas.
- ✅ Inžinierius – matyti objekto **laiptinių kodus** ir kad įvedus laiptinę kodas užsipildytų pats.
- ✅ Inžinierius – įvesti **pranešimo registracijos Nr.**, kad užsipildytų adresas, butas, paslauga, aprašymas, kontaktai, laiptinė, kodas, vadybininkas ir akto tipas.
- ✅ Inžinierius – įklijuoti gyventojo laišką ir gauti užpildytus laukus (DI).
- ✅ Inžinierius – matyti užduoties kortelėje **pastato duomenis** (konstruktyvas, stogas, plotai, šilumos punktas).
- ✅ Inžinierius – telefone skambinti, naviguoti, matyti laiptinės kodą.

### Nuotraukos ir aprašymas
- ✅ Fotografuoti / įkelti nuotraukas, **žymėti** (rodyklės, figūros, numeracija, tekstas).
- ✅ **Padiktuoti** arba parašyti apžiūros aprašymą.

### Aktai
- ✅ Defektavimo aktas ir numatomų darbų aktas su DI; DI užduoda klausimus, kai trūksta informacijos.
- ✅ Pasirinkti išsamumą: **siaurai / vidutiniškai / plačiai**.
- ✅ DI atsižvelgia į **pastato kontekstą** (blokinis/plytinis, stogas, plotai, šilumos punktas, aukštai).
- ✅ **Neatikties aktas** rangovo darbams (nuotraukos + diktavimas → aktas su rangovu, reikalavimu, terminu, parašais).
- ✅ **Pataisyti su DI** nurodymu; DI **įsimena bendras taisykles** (savos kiekvienam; valdomos Nustatymuose).
- ✅ **Peržiūra su redagavimu** tiesiai A4 vaizde; pakeitimai išsaugomi sistemoje.
- ✅ Eksportas **PDF** (spausdinimas) ir **Word (.docx)** (iš redaktoriaus ir iš peržiūros).

### Paskyros ir saugumas
- ✅ Kiekviena paskyra mato **tik jai priskirtas** užduotis; kūrėjas automatiškai tampa atsakingu.
- ✅ **Admin** skirsto užduotis, mato visas, filtruoja pagal darbuotoją.
- ✅ Nustatymai (vardas, parašas, numeracija, komisija) **savi kiekvienai paskyrai**.
- ✅ Naujos paskyros **neaktyvios**, kol admin jų neaktyvuoja; DI funkcija tikrina aktyvumą.
- ✅ Admin importuoja **objektus, laiptinių kodus, pranešimus** (CSV).

## Planuojama / idėjos (prioriteto tvarka – tikslinti su vartotoju)
1. ✅ **Git + GitHub CLI** įdiegti (be admin), pakeitimai keliami `git push`, istorija išlieka. ⬜ Likę: automatinis DI funkcijos diegimas per GitHub Actions (reikia paslapčių `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`).
2. ⬜ Admin: **pastato duomenų redagavimas** programėlėje (dabar tik CSV importu) ir objekto kortelė.
3. ⬜ Pranešimas → užduotis: perkelti **prioritetą** (reikia išsiaiškinti 1/2/3 reikšmę), terminą; pranešimo statusas po akto parengimo; sąrašas „neapdoroti pranešimai“.
4. ⬜ Pranešimų **automatinis atnaujinimas** (kasdienis importas arba tiesioginis ryšys su sistema, jei įmanoma).
5. ⬜ Word: tikslesnis atitikimas formos VP08FA vaizdui (stulpelių pločiai, šrifto dydžiai, antraštė/poraštė su puslapių numeriais).
6. ⬜ Peržiūroje: pridėti / pašalinti eilutes ir nuotraukų paaiškinimus; „atšaukti“ (undo) po redagavimo; komisijos išvados teksto redagavimas konkrečiam aktui.
7. ⬜ Neatiktys: **pakartotinė patikra** (statusas „pašalinta“, nuotraukos po taisymo), rangovų sąrašas Nustatymuose, priminimai apie terminus.
8. ⬜ Ataskaitos admin'ui: užduotys pagal darbuotoją / objektą / statusą, vėluojančios užduotys, DI sąnaudos.
9. ⬜ Veikimas **be ryšio** (laiptinėse be signalo): nuotraukų ir aprašymo eilė, sinchronizuojama vėliau.
10. ⬜ Pranešimai el. paštu / push, kai admin paskiria užduotį.
11. ⬜ Atsarginės kopijos (reguliarus duomenų eksportas), gyventojų duomenų saugojimo terminai (BDAR).
12. ⬜ Automatiniai testai pagrindiniams scenarijams (užduotis → akto generavimas → Word).

## Kaip dirbti toliau
- Naują pokalbį pradėkite projekto aplanke (`defektai_1\defektai`) – Claude automatiškai perskaito `CLAUDE.md`.
- Užtenka parašyti pvz.: „Imame planuojamą Nr. 2: pastato duomenų redagavimas“ – visa kita jau aprašyta.
- Prieš kiekvieną naują funkciją Claude pasiūlo planą, o pabaigoje atnaujina `CLAUDE.md` ir šį failą.
