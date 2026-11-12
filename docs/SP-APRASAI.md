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

## Būklė (2026-11-12)
- 1 etapas – padaryta. 2 etapas – padaryta: funkcija `hp-ai`, mygtukas „Nuskaityti nuotraukas“ žingsnyje „Aprašas (biuras)“ ir prie kiekvieno įrenginio (tik admin). 3 etapas – padaryta: biuro laukai, bendros reikšmės visiems ŠP (`#/sp/nustatymai`), trūkumų sąrašas, PDF ir Word, keli PDF vienu zip (sąraše pažymėjus ŠP arba „Visi parengti aprašai“).
- Apraše tuščios vietos virsta „duomenų nėra“ / „–“; biuras mato jų sąrašą prieš atsisiųsdamas. Tikrinimo taisyklių iš specifikacijos 5 sk. (pvz. slėgių tarpusavio palyginimo) dar nėra – tik privalomų laukų ir įrenginių duomenų patikra.
- Neišbandyta su tikru prisijungimu: DI skaitymas (pirmą kartą paleidžia vartotojas; po to patikrinti `hp_items.ai` ir funkcijos žurnalą) ir sąnaudos vienam ŠP.
- Idėjos toliau: DI patikra iškart po nuotraukos šilumininko telefone („perfotografuokite“ dar esant ŠP); valdiklio ekrano nuotrauka; pigesnis modelis prietaisams be lentelių.

## Duomenų būklė (2026-11-12; patys duomenys – tik Supabase, ne repozitorijoje)
- **Aktyvūs ŠP: 323** (Klaipėda 310, Palanga 13). Išbraukta (`excluded`): Neringa 48, Klaipėdos ŠP be Klaipėdos energijos Excel įrašo 98 ir Debreceno g. 20 – neprižiūrimi.
- **Biuro laukai (`heat_points.office`) užpildyti iš failų:** šildomas plotas, apskaita butuose, valdytojas (`valdytojas_imone`; Klaipėdos energijos „MBP prižiūrimi namai“ Excel, 311 ŠP); tūris (klaipėda.xlsx + baltija.xlsx, 421); unikalus Nr. (PEN sertifikatų CSV + daugiabučių CSV – 280 iš 323; trūksta 43: 13 Palangos, 9 neįrašyti, 21 su keliais pastatų numeriais – laukiama Registrų centro); slėgiai, temperatūros 4.2 skyriui ir ŠP priėmimo metai iš 104 nuskenuotų formų (99 ŠP; rašysena, reikia išrinktinio patikrinimo; `form_statybos_metai` tik informacijai, 53 iš 101 skiriasi nuo registro).
- **Bendros reikšmės (`hp_settings.data.bendri`):** lubų aukštis 2,5 m; Klaipėdos tinklo temperatūros ir KV ribos; tipiniai slėgiai (0,8/0,6; 0,35/0,2; 0,45/0,4 MPa, ±0,05) tiems, kurie nėra gavę savo; grafikas 80/60, KV 55. Kitų miestų nustatymai – `hp_settings.data.miestai` (Palanga: tiekėjas UAB „Palangos šilumos tinklai“, rajoninės katilinės žiemos temperatūros 95/68/59 per `bendri`; vasaros duomenų ir slėgių nėra).
- **Dar trūksta:** 43 unikalūs Nr.; Palangos plotas (13); valdytojų rekvizitai (`hp_settings.valdytojai`); projektiniai galios ir debitai, projekto bei aktų Nr.; visų šilumininkų duomenys (pateiktas tik Rumpiškės g. 32); 5 etapas (schema).
- Duomenų atsarginės kopijos nėra (nemokamas Supabase planas) – prieš masinį darbą apsvarstyti Pro planą ar eksportą.

## Dar reikia iš vartotojo
- Prižiūrėtojo buveinės adresas; kas tvirtina aprašą (pareigos, vardas, pavardė).
- Valdytojas pagal adresą (Mano Būstas Baltija / Mano Būstas Klaipėda) ir kiti trūkstami duomenys pagal adresus (unikalus Nr., šildomas plotas, tūris) – įkels failu.
- Šilumininkų sąrašas (paskyroms) ir jų kvalifikacijos dokumentai.
