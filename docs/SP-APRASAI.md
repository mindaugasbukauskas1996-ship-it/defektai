# Šilumos punktų (ŠP) aprašų modulis – planas

Tikslas: kiekvienam prižiūrimam ŠP parengti „Pastato šildymo ir karšto vandens sistemos aprašą“ (energetikos ministro 2009-11-26 įsakymo Nr. 1-229 13 p.; tikrina VERT). Šilumininkas ŠP nufotografuoja įrenginius ir atsako į klausimyną, DI iš nuotraukų ištraukia techninius duomenis, biuras papildo likusius laukus, sistema sugeneruoja aprašą (Word / PDF).

Šaltiniai (ne repozitorijoje): `Downloads\aprasas-formos-specifikacija.md` (laukų specifikacija, tikrinimo taisyklės) ir Word šablonas „Pastato šildymo ir karšto vandens sistemos aprašas (šablonas).docx“.

## Sprendimai (2026-11-11, patvirtino Mindaugas)
- Ta pati programa ir ta pati Supabase duomenų bazė; **atskira rolė „šilumininkas“** – mato tik ŠP modulį ir tik jam priskirtus ŠP. Inžinieriai ŠP modulio nemato; admin mato viską.
- **ŠP sąrašas – iš objektų registro**: `objects.heat_point` ∈ {Automatizuotas priklausomas (309), Automatizuotas nepriklausomas (127), Elevatorinis (34)} = 470. Nereikalingus galima pažymėti „neprižiūrimas“. Name gali būti 2 ŠP (retai) – galima pridėti antrą.
- **Vedlys veikia tik su internetu** (ŠP ryšys dažniausiai yra). Kur nėra – fotografuoti telefono kamera ir įkelti iš galerijos.
- **Schema: tiksli kopija iš nuotraukos.** DI nuskaito ant sienos kabančią schemą į elementų ir jungčių sąrašą, sistema ją nubraižo naujai, sutikrina su nufotografuotais įrenginiais (neatitikimus pataiso schemoje) ir užpildo žymenų lentelę. Nekokybiška nuotrauka → prašymas perfotografuoti. Kiekvieną perbraižytą schemą turi peržiūrėti žmogus. Jei schemos nėra – braižoma iš įrenginių sąrašo.
- **Saugykla: Supabase Pro (mokamas planas)** – nuotraukoms reikės ~3–5 GB (nemokamas planas 1 GB). Planą perjungia vartotojas, kai priartėsime prie ribos.
- Pastovūs duomenys (atestatas, telefonai, atsakingi asmenys, šilumos tiekėjas, atsakomybės riba, vamzdynų žymėjimo spalvos, paslėptų vamzdynų tekstas) saugomi **duomenų bazėje (ŠP modulio nustatymai), ne viešame kode**. Šilumininko duomenys (vardas, kvalifikacijos dokumentas, telefonas) – jo profilyje.
- Įrenginių savininkas visada „Bendraturčiai“, išskyrus šilumos skaitiklį – šilumos tiekėjas.
- 5 (projekto duomenys), 6 (garantijos), 7 (ribos) skyrių dokumentiniai laukai pildomi vėliau biure; kol nėra – „duomenų nėra“ su priežastimi. Tuščių laukų galutiniame apraše nelieka.

## ŠP variantai, kuriuos vedlys turi suprasti
- Šildymas: elevatorinis (be šilumokaičio, kartais be siurblio) / automatizuotas priklausomas (be šilumokaičio, su siurbliu ir vožtuvu) / automatizuotas nepriklausomas (šilumokaitis, išsiplėtimo indas, apsauginis vožtuvas, papildymas).
- Karštas vanduo: neruošiamas / lygiagreti schema / dviejų pakopų; su cirkuliacija arba be.
- Mišrūs: pvz. šildymas elevatorinis, KV ruošimas automatizuotas.
- Vedlys pirmiausia paklausia tipo ir rodo tik tinkamus žingsnius; bet kurį įrenginį galima pažymėti „nėra“ arba pridėti papildomą.

## Etapai
1. **Pagrindas ir vedlys.** Lentelės (ŠP, įrenginiai, nuotraukos, atsakymai), rolė „šilumininkas“, RLS, ŠP sąrašas ir priskyrimas, šilumininko vedlys: klausimynas + nuotraukų žingsniai (gamyklinė lentelė privaloma kiekvienam įrenginiui), visi laukai įvedami ir ranka.
2. **DI nuotraukų skaitymas.** Edge funkcija: gamyklinė lentelė → gamintojas, modelis, rodikliai; pažymima, kas įskaityta, kas spėta; neįskaitoma → „perfotografuoti“.
3. **Aprašo generavimas.** Word ir PDF pagal šabloną, biuro laukai, tikrinimo taisyklės (spec. 5 sk.), trūkstamų duomenų sąrašas; visų PDF atsisiuntimas vienu failu (zip).
4. **Suvestinė (dashboard).** Pažanga pagal šilumininką, kiek ŠP aplankyta / paruošta, kiek trūksta kiekvienam aprašui.
5. **Schema.** DI perbraižymas, sutikrinimas su įrenginiais, žymenys, peržiūra ir taisymas.

## Dar reikia iš vartotojo
- Prižiūrėtojo buveinės adresas; kas tvirtina aprašą (pareigos, vardas, pavardė).
- Valdytojas pagal adresą (Mano Būstas Baltija / Mano Būstas Klaipėda) ir kiti trūkstami duomenys pagal adresus (unikalus Nr., šildomas plotas, tūris) – įkels failu.
- Šilumininkų sąrašas (paskyroms) ir jų kvalifikacijos dokumentai.
