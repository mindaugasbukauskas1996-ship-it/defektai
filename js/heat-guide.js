// Šilumininko instrukcija: kaip pildyti šilumos punkto (ŠP) duomenis programoje. Rodoma puslapyje #/sp/instrukcija.
// Tekstas pagal tikrą vedlį (js/heat-model.js). Keičiant klausimus ar žingsnius, atnaujinkite ir čia.

const H = (n, t) => `<h2 class="gd-h"><span>${n}</span> ${t}</h2>`;
const L = items => `<ul class="gd-l">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const N = items => `<ol class="gd-l">${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
const TIP = t => `<div class="gd-tip"><b>Patarimas.</b> ${t}</div>`;
const WARN = t => `<div class="gd-warn"><b>Svarbu.</b> ${t}</div>`;

export function renderGuide(el) {
  el.innerHTML = `
  <style>
    .gd { max-width: 820px; margin: 0 auto; line-height: 1.5; }
    .gd h1 { margin: 0 0 4px; }
    .gd .gd-sub { color: #566; margin-bottom: 16px; }
    .gd-h { margin: 22px 0 8px; font-size: 1.15rem; display: flex; gap: 10px; align-items: center; }
    .gd-h span { background: #2f8f3a; color: #fff; border-radius: 50%; min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-size: .95rem; }
    .gd-l { margin: 6px 0 10px 1.2em; padding: 0; }
    .gd-l li { margin: 3px 0; }
    .gd-tip, .gd-warn { border-radius: 8px; padding: 8px 12px; margin: 10px 0; }
    .gd-tip { background: #eaf6ec; border: 1px solid #b9dfbf; }
    .gd-warn { background: #fff4e0; border: 1px solid #f0cf94; }
    .gd table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    .gd th, .gd td { border: 1px solid #ccd; padding: 6px 8px; text-align: left; vertical-align: top; }
    .gd th { background: #f3f5f7; }
    @media print { .print-only { display: block !important; } .gd { max-width: none; font-size: 10.5pt; } .gd-h { break-after: avoid; } .gd-tip, .gd-warn { break-inside: avoid; } }
  </style>
  <div class="gd">
    <div class="page-head no-print"><h1>Šilumininko instrukcija</h1>
      <span class="head-btns"><a class="btn ghost" href="#/sp">← Šilumos punktai</a><button class="btn primary" type="button" id="gd-print">Spausdinti / PDF</button></span></div>
    <h1 class="print-only" style="display:none">Šilumininko instrukcija</h1>
    <div class="gd-sub">Kaip pildyti šilumos punkto duomenis programoje „Defektų aktai“ (modulis „Šilumos punktai“). Ši instrukcija – nuo prisijungimo iki pateikimo.</div>

    ${H(1, 'Prisijungimas')}
    ${L([
      'Atidarykite programą telefone ar kompiuteryje (nuoroda iš biuro). Telefone patogu ją „pridėti prie pagrindinio ekrano“, tada ji atsidaro kaip programėlė.',
      'Prisijungimo lange įveskite <b>prisijungimo vardą</b> (arba el. paštą) ir slaptažodį, kuriuos gavote iš biuro. Jei vardas be „@“ (pvz. <i>vardas.pavarde</i>) – rašykite jį visą, be el. pašto galūnės.',
      'Pirmą kartą prisijungę eikite į <b>Paskyra</b> ir pakeiskite slaptažodį, įrašykite savo vardą, pavardę, telefoną ir kvalifikacijos dokumentą (jie rašomi į aprašą).',
      'Šilumos punktuose dirbkite <b>su internetu</b>. Jei ryšio nėra, nuotraukas darykite telefono kamera, o įkelkite vėliau iš galerijos.'
    ])}

    ${H(2, 'Darbo eiga trumpai')}
    ${N([
      'Sąraše <b>Šilumos punktai</b> matote tik jums priskirtus adresus. Atidarykite tą, kuriame esate.',
      'Eikite žingsniais iš eilės: <b>ŠP tipas → Nuotraukos ir schema → Įvadas ir apskaita → Šildymas → Karštas vanduo → Vamzdynai ir prietaisai</b>.',
      'Viršuje matote, kiek dar trūksta (procentai ir sąrašas). Galite sustoti ir tęsti vėliau: viskas išsaugoma pati.',
      'Kai viskas surinkta, paskutiniame žingsnyje spauskite <b>Pateikti</b>. Biuras peržiūri; jei ko trūksta, punktas grįžta su pastaba „Grąžinta taisyti“.'
    ])}

    ${H(3, 'Žingsnis „ŠP tipas“')}
    <table>
      <tr><th>Klausimas</th><th>Kaip atsakyti</th></tr>
      <tr><td>Kur yra šilumos punktas?</td><td>Trumpai: rūsys, 2 laiptinė, pastatas šone ir pan.</td></tr>
      <tr><td>Koks šildymas?</td><td>Jei jau pažymėta pagal registrą, patikrinkite ir pakeiskite, jei vietoje kitaip. <b>Automatizuotas su šilumokaičiu</b> – yra šilumokaitis, siurblys, vožtuvas; <b>Elevatorinis</b> – be šilumokaičio, su elevatoriumi (su valdikliu arba be jo).</td></tr>
      <tr><td>Ar yra šildymo siurblys?</td><td>Klausiama tik elevatoriniam. Taip, jei šildymo kontūre pastatytas cirkuliacinis siurblys.</td></tr>
      <tr><td>Kaip ruošiamas karštas vanduo?</td><td>Pasirinkite vieną. <b>Dviejų pakopų</b> – yra karšto vandens šilumokaitis ir dar šildymo šilumokaitis, kuris pašildo vandenį pirmiau; <b>Karšto vandens šilumokaitis</b> – lygiagreti schema; <b>Neruošiamas</b> – ŠP karšto vandens neruošia.</td></tr>
      <tr><td>Ar KV su cirkuliacija?</td><td>Taip, jei karšto vandens sistemoje yra cirkuliacijos stovai ir cirkuliacinis siurblys.</td></tr>
      <tr><td>Nuotolinis valdymas</td><td>Atsakykite, jei žinote. Neklausiama, kai tai jau žinoma.</td></tr>
      <tr><td>Ar name daugiau nei vienas ŠP?</td><td>Jei „Taip“, programa pati sukuria antrą šilumos punktą (jį rasite sąraše). Jei jų daugiau nei du, pasakykite biurui.</td></tr>
    </table>
    ${WARN('Nuo šio žingsnio atsakymų priklauso, kokių įrenginių klausiama toliau. Jei vėliau pakeisite tipą, įrenginių sąrašas persidarys (jau užpildyti įrenginiai neišnyksta).')}

    ${H(4, 'Žingsnis „Nuotraukos ir schema“')}
    ${L([
      '<b>Bendros ŠP nuotraukos</b> – bent 2, geriausia 4 iš skirtingų kampų, kad matytųsi visi įrenginiai ir vamzdynai.',
      '<b>Ar kabo schema?</b> Jei „Taip“, nufotografuokite ją: <b>tiesiai iš priekio, visa schema kadre, be blizgesio</b>. Jei schema didelė – dar kelios nuotraukos iš arčiau.',
      'Prasta schemos nuotrauka reiškia, kad aprašo schema bus prastesnė, todėl geriau perfotografuokite vietoje.'
    ])}
    ${TIP('Schemą fotografuokite horizontaliai (telefoną laikykite gulsčiai), nuo viršaus iki apačios su rėmeliu. Jei užstoja blizgesys – pasukite telefoną ar atsitraukite į šoną.')}

    ${H(5, 'Žingsniai „Įvadas ir apskaita“, „Šildymas“, „Karštas vanduo“')}
    <p>Čia kiekvienam įrenginiui yra atskira kortelė. <b>Pildykite pagal eilę.</b> Ką daryti su kiekviena kortele:</p>
    ${N([
      '<b>Jei įrenginio nėra</b> – pažymėkite „Šio įrenginio nėra“ ir eikite toliau.',
      '<b>Jei yra</b> – įkelkite nuotraukas (mygtukai „Fotografuoti“ arba „Iš galerijos“). <b>Pirma nuotrauka – gamyklinė lentelė</b> (kad matytųsi visi užrašai ir skaičiai), antra – bendras įrenginio vaizdas.',
      'Po įkėlimo sistema <b>pati nuskaito lentelę</b> ir parodo, ar pavyko. Jei parašyta „perfotografuokite“ – tuoj pat, kol esate vietoje, nufotografuokite iš arčiau, be blykstės, be blizgesio.',
      'Duomenų laukelių ranka pildyti <b>nereikia</b>, jei lentelė nuskaityta. Naudokite „Įvesti duomenis ranka“ tik tada, kai lentelės nėra arba jos neįmanoma nufotografuoti (rašykite gamintoją, modelį ir rodiklius).'
    ])}
    <p><b>Ypatingi atvejai:</b></p>
    <table>
      <tr><th>Įrenginys</th><th>Ką daryti</th></tr>
      <tr><td>Pavara</td><td>Iš sąrašo pasirinkite <b>Danfoss AMV 10</b> arba <b>AMV 30</b> – tada nuotraukos neprivalomos. Jei kita (pvz. Siemens) – pasirinkite „Kita“ ir nufotografuokite lentelę.</td></tr>
      <tr><td>Apsauginis vožtuvas</td><td>Gamintojo nereikia. Svarbu <b>skersmuo (DN) ir suveikimo slėgis (bar)</b>: jie užrašyti ant vožtuvo korpuso arba dangtelio.</td></tr>
      <tr><td>Reguliavimo vožtuvas</td><td>Jei ant korpuso matosi raudona juostelė su DN ir PN – tai Danfoss. Nufotografuokite iš arčiau; užtenka matyti DN ir Kvs.</td></tr>
      <tr><td>Cirkuliacinis siurblys</td><td>Fotografuokite lentelę (modelis). Našumą, slėgį ir galią biuras gali pasitikslinti pagal modelį.</td></tr>
      <tr><td>Manometrai ir termometrai</td><td>Viena bendra kortelė: nufotografuokite visus ŠP esančius manometrus ir termometrus, užtenka kelių bendrų nuotraukų.</td></tr>
      <tr><td>Uždaromoji armatūra (įvadinės sklendės)</td><td>Nuotrauka su viso vamzdyno vaizdu; nurodykite tipą ir DN, jei žinote.</td></tr>
      <tr><td>Šilumos skaitiklis</td><td>Fotografuokite lentelę (gamintojas, Nr., DN, Qnom) ir rodmenų ekraną.</td></tr>
      <tr><td>Dar vienas įrenginys</td><td>Kortelių apačioje: „Yra dar vienas įrenginys?“ – pasirinkite rūšį ir pridėkite. Per klaidą pridėtą galima pašalinti šiukšlių dėžės mygtuku.</td></tr>
    </table>

    ${H(6, 'Žingsnis „Vamzdynai ir prietaisai“')}
    <p>Čia – klausimai apie visą pastato sistemą. Atsakykite pagal tai, ką matote ŠP, rūsyje ir name.</p>
    ${L([
      '<b>Šildymo sistemos tipas</b> (vienvamzdė, dvivamzdė, kolektorinė) ir <b>šilumnešio paskirstymas</b> (apatinis ar viršutinis) – jeigu nežinote, galite praleisti, bet jei galite pasitikslinti (pvz. pas gyventojus ar pagal stovus), pažymėkite.',
      '<b>Kur išvedžiotos magistralės ir stovai</b> (rūsyje, palėpėje, techniniame koridoriuje; butuose, laiptinėse, šachtose) – galima pažymėti kelis.',
      '<b>Vamzdžių medžiaga, skersmenys, izoliacija, armatūra</b> – pasirinkite iš pasiūlymų pagal tai, ką matote. Skersmenys rašomi „magistralė – stovas“ (pvz. DN50 – DN15).',
      '<b>Balansiniai ventiliai</b>, <b>termostatiniai ventiliai</b>, <b>šildymo prietaisai butuose</b> (ketiniai ar plieniniai radiatoriai) ir <b>vonių šildytuvai</b> (prie karšto vandens ar prie šildymo).',
      'Karšto vandens vamzdynų klausimų nebus, jei karštas vanduo šiame ŠP neruošiamas.'
    ])}
    ${WARN('Žvaigždute (*) pažymėti klausimai ir nuotraukos yra privalomi. Kol jų nėra, viršuje rodoma, kad trūksta.')}

    ${H(7, 'Pateikimas')}
    ${N([
      'Paskutiniame žingsnyje matote suvestinę: ko dar trūksta.',
      'Susitvarkę, spauskite <b>Pateikti</b>. Po to punktas laikomas pateiktu, o biuras jį peržiūri.',
      'Jei punktas grįžta („Grąžinta taisyti“), atidarykite jį, perskaitykite pastabą, pataisykite ir pateikite iš naujo.'
    ])}

    ${H(8, 'Kaip gerai nufotografuoti lentelę')}
    ${L([
      'Lentelė – <b>visa kadre</b>, tiesiai iš priekio, ne iš šono.',
      '<b>Be blykstės</b> ir be blizgesio: lentelė dažnai blizga. Pasukite telefoną ar žibintuvėlį į šoną, kad atspindys nepatektų.',
      '<b>Ryškiai</b>: palaukite sekundę, kol telefonas sufokusuos; nuvalykite dulkes nuo lentelės.',
      'Skaičiai turi būti <b>įskaitomi</b>: jei pats akimis vargu perskaitote – ir sistema neperskaitys. Prieikite arčiau.',
      'Jei užrašai išblukę ar nuvalkioti – nufotografuokite geriausiai kaip įmanoma ir pasirinkite „Įvesti duomenis ranka“, jei ką nors žinote.',
      '<b>Nieko neardykite</b> ir nenuimkite izoliacijos tik dėl lentelės. Jei jos nematyti – užrašykite pastabą.'
    ])}

    ${H(9, 'Dažniausi klausimai')}
    <table>
      <tr><th>Situacija</th><th>Ką daryti</th></tr>
      <tr><td>Nėra interneto</td><td>Darykite nuotraukas telefono kamera, o programoje įkelkite vėliau (iš galerijos).</td></tr>
      <tr><td>Įrenginio nėra arba jis kitoks</td><td>Pažymėkite „Šio įrenginio nėra“ arba pridėkite kitą įrenginį. Jei ŠP tipas visai kitoks – grįžkite į pirmą žingsnį ir pataisykite.</td></tr>
      <tr><td>Lentelė nenuskaitoma</td><td>Perfotografuokite iš arčiau. Jei vis tiek ne – įveskite ranka arba parašykite pastabą.</td></tr>
      <tr><td>Per klaidą pasirinkau</td><td>Tiesiog pasirinkite iš naujo; viskas išsaugoma automatiškai.</td></tr>
      <tr><td>Name du šilumos punktai</td><td>Pirmo žingsnio klausime „daugiau nei vienas ŠP?“ pasirinkite „Taip“. Antras atsiras sąraše; užpildykite jį atskirai.</td></tr>
      <tr><td>Neradau savo ŠP sąraše</td><td>Jis jums gal nepriskirtas. Susisiekite su biuru.</td></tr>
    </table>
    ${TIP('Geriausia eiti ŠP iš eilės: įvadas → šildymas → karštas vanduo. Taip nepamiršite nė vieno įrenginio.')}
  </div>`;
  const b = el.querySelector('#gd-print');
  if (b) b.addEventListener('click', () => window.print());
}
