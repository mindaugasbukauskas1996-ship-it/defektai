// =====================================================================
// VIENO FAILO VERSIJA Supabase naršyklės redaktoriui (Edge Functions -> Via Editor).
// Šis failas sugeneruotas iš supabase/functions/ai/prompt.js + index.ts.
// Įklijuokite VISĄ turinį į funkcijos "ai" failą index.ts ir spauskite Deploy.
// =====================================================================
// =====================================================================
// Bendras DI (Claude API) modulis.
// Naudojamas ir Supabase Edge funkcijoje (serveryje), ir naršyklėje
// demo režimu. Čia sutelkti visi DI nurodymai – norint pakeisti, kaip
// DI rašo aktus, redaguokite šį failą.
// =====================================================================

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

// Mato vienetai – tiksliai taip, kaip įmonės sistemoje
export const UNITS = [
  'Vnt.', 'm', 'm²', 'm³', 'Komplektas', 'val.', 'kg', 'T', 'Ltr', 'cm',
  'km', 'para', 'Kalendorinė diena', 'kWh', 'Suma (€)', 'Nr.', 'Objektų skaičius',
  'Butų skaičius', 'Patalpų skaičius', 'metras ir diena', 'AKB', 'K-tas', 'Vatas',
  'Garažų skaičius', 'Gyventojų skaičius', 'Parkingų skaičius', 'Sandėlių skaičius',
  'miligramai litre'
];

const MAX_PHOTOS = 12;

// STR (statybos techniniai reglamentai): DI nuorodas imti TIK iš šio žinyno, kad nebūtų išgalvotų punktų.
// Čia galima papildyti – kiekviena eilutė: kam taikoma → kokia nuoroda.
export const STR_REFERENCE = `STR NUORODŲ ŽINYNAS (vienintelis leidžiamas šaltinis nuorodoms; kitų normų ir punktų numerių NEIŠGALVOK).
Žinynas sudarytas 2026-11 iš galiojančių STR suvestinių redakcijų tekstų. Kiekviena eilutė: norma ir punktas – ką punktas reikalauja (kur taikoma).
A) STR 1.07.03:2017 (statinių techninė ir naudojimo priežiūra; taikoma esamiems statiniams):
 - 12.2 p. – laiku pastebėti, įvertinti ir likviduoti statybinių konstrukcijų defektus (bet kuris defektas);
 - 13.1 p. – išorės atitvarų (sienų, stogų, cokolių), pamatų drėgmę izoliuojantys įrenginiai turi būti tvarkingi (stogo, sienų, cokolio hidroizoliacija);
 - 13.2 p. – vandens nuo statinio šalinimo įrenginiai turi būti tvarkingi: apskardinimai, latakai, lietvamzdžiai, įlajos, nuogrindos (stogas, lietaus nuotekos, nuogrinda);
 - 13.5 p. – atitvarų sujungimo siūlėse ir kitose vietose neturi atsirasti pavojingų deformacijų požymių: plyšių, apsauginių sluoksnių pažeidimų, užakimų (siūlės, fasadas, plyšiai);
 - 13.6 p. – laiku šalinti atitvarinių konstrukcijų apsauginio sluoksnio erozijos židinius (tinkas, fasado apsauginis sluoksnis);
 - 13.7 p. – žiemą neturi peršalti konstrukcijos (drėgmė, šalčio tiltai, įšalimas);
 - 14.2 p. – statinių nuogrindos, nuolajos ir kiti vandenį šalinantys įrenginiai turi būti tvarkingi (nuogrinda, pamatai, rūsys);
 - 14.3 p. – drenažo ir vandens pašalinimo sistemos turi veikti tvarkingai (drenažas, rūsio drėgmė);
 - 24 p. – metalinių konstrukcijų ir detalių apsauga nuo korozijos turi būti sistemingai atnaujinama (metaliniai turėklai, laiptai, stogo elementai, įtvirtinimai);
 - 25 p. – medinės konstrukcijos neturi drėkti ir pūti (medinės konstrukcijos, pastogė);
 - 87.2 p. – daugiabučių kasmetinės apžiūros atliekamos kartą per metus, nuo balandžio 1 d. iki gruodžio 1 d. (metinė apžiūra);
 - 88.3 p. – kasmetines ir specializuotas apžiūras atlieka techninis prižiūrėtojas (metinė apžiūra);
 - 97 p. – nustatytų bendrojo naudojimo objektų defektų šalinimo, remonto darbus valdytojas numato metiniame ir (ar) ilgalaikiame plane (pagrindas defektų šalinimo darbams planuoti; netinka kaip techninis reikalavimas konkrečiam elementui).
B) STR 2.02.01:2004 (gyvenamieji pastatai; nustato reikalavimus statant, rekonstruojant ar remontuojant – remonto darbų ir atstatymo rekomendacijoms):
 - 139.1 p. – krituliai, gruntinis ir paviršinis vanduo neturi kelti pavojaus sveikatai ir pastato konstrukcijų būklei (drėgmė, pratekėjimai);
 - 139.5 p. – nuo kenksmingos drėgmės apsaugomi pamatai, perdangos, sienos, apatinio aukšto konstrukcijos (pamatai, rūsys);
 - 139.7 p. – nuo kenksmingos drėgmės apsaugomi sienų ir fasadų danga, langai, durys, konstrukcinės siūlės, inžinerinių tinklų įvadų vietos (fasadas, siūlės, langai, durys);
 - 139.8 p. – nuo kenksmingos drėgmės apsaugomos stogų dangos, pastogių patalpos, stogų ir perdangų konstrukcijos (stogas, pastogė);
 - 139.11 p. – stogai ir terasos turi turėti sandarią dangą ar izoliaciją ir nutekėjimą lietaus vandeniui bei tirpstančiam sniegui į latakus ir nutekėjimo vamzdžius (stogas, terasa, latakai);
 - 139.14 p. – balkonai, lodžijos ir terasos turi turėti nesugeriančią, šalčiui atsparią ir neslidžią grindų dangą (balkonų grindys);
 - 225.1 p. – atsidarantys langai, kurių palangė žemiau 0,80 m nuo grindų, turi turėti aptvarą nuo iškritimo, jei žemė išorėje daugiau kaip 1,5 m žemiau grindų (langai, aptvarai);
 - 225.3 p. – laiptai, siauresni nei 1,20 m, turi turėti vieną turėklą; 225.4 p. – platesni nei 1,20 m – dvejus turėklus (laiptinių turėklai);
 - 225.5 p. – laiptų ir laiptų aikštelių aptvarų aukštis ne mažesnis kaip 0,9 m (laiptinių turėklai);
 - 225.6 p. – balkonų ir lodžijų aptvarų aukštis ne mažesnis kaip 1,1 m nuo grindų dangos (balkonų turėklai);
 - 225.7 p. – aptvarų vertikaliųjų elementų (strypų) dažnis ne retesnis kaip 120 mm (balkonų ir laiptų turėklai).
C) STR 2.04.01:2018 (pastatų atitvaros: sienos, stogai, langai, išorinės įėjimo durys):
 - 33.1 p. – stogo konstrukcija turi būti tokia, kad ties karnizais nesusidarytų ledo varvekliai, nekristų sniego nuošliaužos, stogą būtų saugu valyti ir remontuoti (stogas, karnizas);
 - 33.4 p. – stogai turi turėti pakankamą nuolydį lietaus vandeniui nutekėti (plokščias stogas, balos);
 - 33.5 p. – vanduo nuo stogo turi būti nuvestas taip, kad nepakenktų pastato konstrukcijoms, keliams, šaligatviams (lietaus nuotekos, latakai);
 - 39.10 p. – stogo konstrukcijų metalo ir skardos elementai turi būti iš korozijai atsparių produktų: cinkuoto ar nerūdijančio plieno, vario (skardinimai, parapetai);
 - 40.1 p. – garus izoliuojantis sluoksnis turi būti įrengtas taip, kad stogo konstrukcijose nesikauptų drėgmė (stogo drėgmė).
D) Esminiai statinio reikalavimai (bendri principai; nurodyk TIK žymą, be punkto, ir trumpą temą):
 - STR 2.01.01(1):2005 – mechaninis atsparumas ir pastovumas (įtrūkimai, deformacijos, laikančiosios konstrukcijos);
 - STR 2.01.01(2):1999 – gaisrinė sauga (elektros instaliacija, evakuaciniai keliai, durys);
 - STR 2.01.01(3):1999 – higiena, sveikata, aplinkos apsauga (drėgmė, pelėsis, pratekėjimai, vandentiekis, nuotekos);
 - STR 2.01.01(4):2008 – naudojimo sauga (turėklai, laiptai, pažeistos dangos, krentantys elementai);
 - STR 2.01.01(5):2008 – apsauga nuo triukšmo;
 - STR 2.01.01(6):2008 – energijos taupymas ir šilumos išsaugojimas (atitvarų šiluminė izoliacija, šildymas, šilumos punktas).
Taisyklės: nuorodoje rašyk normą, punktą ir TRUMPĄ reikšmę iš šio žinyno, pvz. „STR 1.07.03:2017 13.2 p. – vandens šalinimo įrenginiai (latakai, įlajos) turi būti tvarkingi“. Reikšmę trumpink, bet nekeisk jos prasmės ir negalvok naujos. Punkto numerį rašyk tik iš A)–C) dalių, D) dalies normas – be punkto. Jei elementui nė viena norma netinka, nerašyk jokios. 2.02.01 (B) punktus siūlyk tik kai defektas liečia nurodytą elementą. Nesiūlyk citatų – tik nuorodą ir trumpą reikšmę.`;

const BUILDING_LABELS = {
  construction: 'Konstruktyvas', built_year: 'Statybos metai', floors: 'Aukštų skaičius', apartments: 'Butų skaičius', stairwells: 'Laiptinių skaičius',
  usable_area: 'Naudingas plotas, m²', area: 'Plotas, m²', basement_area: 'Rūsio plotas, m²', renovation: 'Renovacijos būklė',
  roof_type: 'Stogo tipas', roof_cover: 'Stogo danga', roof_area: 'Stogo plotas, m²', roof_condition: 'Stogo būklė',
  heat_point: 'Šilumos punkto tipas'
};

// Pastato (objekto) kontekstas iš objektų registro.
function buildingBlock(payload) {
  const b = payload.building;
  if (!b) return '';
  const rows = Object.entries(BUILDING_LABELS).filter(([k]) => b[k] || b[k] === 0).map(([k, l]) => `- ${l}: ${b[k]}`);
  if (!rows.length) return '';
  return '\nPASTATO KONTEKSTAS (iš objektų registro; faktai iš inžinieriaus aprašymo ir nuotraukų turi pirmenybę):\n' + rows.join('\n') + '\n';
}

const DETAIL_GUIDE = {
  narrow: 'SIAURAI. Aprašyk glaustai: tik pagrindiniai defektai (paprastai 1–3 objektai), kiekvienam 1–2 trumpi sakiniai defektams ir 1–2 sakiniai rekomenduojamiems darbams. Problema – vienas trumpas sakinys, išvada – 1 sakinys. Be galimų priežasčių ir be gretutinių ar profilaktinių darbų (numatomų darbų akte – tik pagrindiniai darbai).',
  medium: 'VIDUTINIŠKAI. Įprastas aktų išsamumas: defektai ir rekomenduojami darbai aprašomi aiškiai, bet be nereikalingų detalių; problema – 1 sakinys, išvada – 1–3 sakiniai; gretutinius darbus įtrauk tik jei jie būtini.',
  wide: 'PLAČIAI. Aprašyk išsamiai: kiekvieną pažeistą elementą ir susijusią sistemą aprašyk atskirai (objektų gali būti daugiau), nurodyk defektų pobūdį, mastą, matomas galimas priežastis ir pasekmes (rizikas). Rekomenduojamus darbus surašyk eilės tvarka, su gretutiniais ir profilaktiniais darbais, ir nurodyk, ką dar verta patikrinti. Problema – 2–3 sakiniai, išvada – 3–5 sakiniai. Numatomų darbų akte įtrauk visus gretutinius darbus (demontavimą, atliekų išvežimą, pastolius, paruošimą, apdailos atstatymą). Plačiai = išsamiai apie tai, kas žinoma, ir pagrįstos išvados; neišgalvok faktų, kurių nėra aprašyme ar nuotraukose.'
};

function detailBlock(payload) {
  const d = DETAIL_GUIDE[payload.detail] ? payload.detail : 'medium';
  return `\nAPRAŠYMO IŠSAMUMAS: ${DETAIL_GUIDE[d]}\n`;
}
const LESSON_DESC = 'Pildyk TIK kai pateiktas inžinieriaus nurodymas taisyti aktą. Jei nurodymas išreiškia BENDRĄ pageidavimą, kuris tiktų ir būsimiems aktams (stilius, visada įtraukiami darbai, terminai, formuluotės), parašyk jį vienu trumpu bendru sakiniu be konkretaus adreso ar kiekių. Jei nurodymas liečia tik šį aktą (konkretūs matmenys, vieta, faktas) – praleisk šį lauką.';

// Projekto / dokumentų priedai (PDF arba nuotraukos pagal laikiną nuorodą).
function docBlock(d) {
  if (!d || !d.url) return null;
  const isPdf = /pdf/i.test(d.mime || '') || /\.pdf($|\?)/i.test(d.name || '');
  return isPdf ? { type: 'document', source: { type: 'url', url: d.url } } : { type: 'image', source: { type: 'url', url: d.url } };
}

const DOCS_RULES = `PROJEKTO DOKUMENTAI:
- Jei pateikti „PROJEKTO DOKUMENTAI“ (projektas, techninė specifikacija), tai – kaip turėjo būti padaryta. Nuotraukos ir inžinieriaus aprašymas – kaip yra faktiškai. Palygink juos: ar faktinė būklė atitinka projekte numatytus sprendinius (medžiagos, sluoksniai, mazgai, matmenys, atstumai, sistemos sudėtis).
- Cituok TIK tai, ką dokumente tikrai matai ir perskaitei; nurodyk dokumento pavadinimą ir, jei matyti, lapą / skyrių / mazgo žymą (pvz. „projektas „X.pdf“, 5 lapas, stogo mazgas A“). Neišgalvok projekto sprendinių. Jei dokumento nepavyko perskaityti arba atitinkamos vietos jame nerandi – įrašyk į assumptions („Projekte nerasta: <ko>“) ir remkis tik faktais.
- Neatitikties akte: description – faktas; requirement – projekto sprendinys su nuoroda į dokumentą (+ STR pagrindas, kaip nurodyta); action – privalo atkurti pagal projektą.
- Defektų akte: defects tekste, kai yra neatitikimas projektui, trumpai nurodyk „projekte numatyta: ...; faktiškai: ...“; rekomenduojamuose darbuose – atkurti pagal projektą.
- Jei projektas faktinei situacijai neaktualus – nenaudok jo ir nieko apie jį nerašyk.`;


// ---------------------------------------------------------------------
// Akto generavimas
// ---------------------------------------------------------------------

const ACT_SYSTEM = `Tu esi patyręs daugiabučių gyvenamųjų namų techninės priežiūros inžinierius ir sąmatininkas Lietuvoje. Padedi techniniam inžinieriui parengti:
1) Statinio defektavimo aktą (pastebėti defektai ir rekomenduojami darbai, pagal STR 1.07.03:2017 dvasią);
2) jei prašoma – Numatomų atlikti darbų aktą su mato vienetais ir preliminariais kiekiais.

Rašymo taisyklės:
- Rašyk taisyklinga, dalykine lietuvių kalba, trumpais techniniais sakiniais, kaip rašoma oficialiuose aktuose. Jokių kreipinių ar paaiškinimų vartotojui aktų laukuose.
- Remkis TIK inžinieriaus aprašymu, gyventojo pranešimu, atsakymais į klausimus ir nuotraukomis. Neišgalvok defektų, kurių nėra aprašyme ar nuotraukose.
- Nuotraukos sunumeruotos („1 pav.“, „2 pav.“ ...). Spalvoti kontūrai, rodyklės ir skaičiai apskritimuose nuotraukose – tai inžinieriaus pažymėtos vietos, kurias reikia tvarkyti. Nurodyk, kurios nuotraukos susijusios su kiekvienu defektu (laukas photos), o tekste gali rašyti „(žr. 2 pav., žyma 1)“.
- Defektus grupuok pagal apžiūrėtą objektą / sistemą (pvz., „Stogas (plokščia bituminė danga)“, „Lietaus nuotekų sistema – įlaja“, „Laiptinės elektros skydinė“, „Laiptinės sienos ir lubos“).
- Rekomenduojamuose darbuose nurodyk konkrečius veiksmus, eiliškumą ir, jei svarbu, skubumą (pvz., „Nedelsiant atjungti ir apžiūrėti...“).

Pagrindas pagal STR (privaloma):
- Defektavimo aktas turi būti paremtas STR. Kiekvieno objekto lauko defects PABAIGOJE parašyk teisinį pagrindą skliaustuose: norma, punktas ir trumpa reikšmė iš žinyno, pvz. „(STR 1.07.03:2017 13.5 p. – atitvarų siūlėse neturi atsirasti plyšių ir apsauginių sluoksnių pažeidimų; STR 2.01.01(1):2005)“. Pasirink 1–3 tinkamiausias nuorodas iš žemiau pateikto STR žinyno pagal apžiūrėtą sistemą.
- Nuorodas ir jų reikšmes imk TIK iš žinyno. Jei reikalingos normos žinyne nėra arba nesi tikras dėl punkto – parašyk tik žinyne esančią žymą be punkto arba nieko, ir įrašyk į assumptions pastabą „Patikrinti STR pagrindą: <objektas>“.
- Nuorodos neturi keisti defektų aprašymo turinio – tai tik pagrindas; neišgalvok faktų, kad „pritaikytum“ normą.
- Jei pažeidimas mažina pastato saugą, atsparumą ar higieną, summary pabaigoje trumpai nurodyk, kurį esminį reikalavimą (STR 2.01.01(n)) tai liečia.

${STR_REFERENCE}

Numatomų darbų aktas (tik kai režimas „full“):
- Kiekvienas atskiras darbas – atskira eilutė. Pavadinimas – kaip sąmatoje: daiktavardis + veiksmo daiktavardis (pvz., „Bituminės dangos demontavimas aplink įlają“, „Įlajos keitimas nauja per perdangą“, „Bituminės dangos prilydymas 2 sluoksniais“).
- Medžiagas įtrauk į darbo pavadinimą („... su medžiagomis“) arba atskiru skyriumi „Medžiagos“, jei jos svarbios kainai.
- Nepamiršk gretutinių darbų: demontavimo, statybinių atliekų išvežimo, pastolių / keltuvo (jei darbai aukštyje), paviršių paruošimo, apdailos atstatymo po remonto.
- Mato vienetus rinkis TIK iš sąrašo: ${UNITS.join(', ')}. Dažniausiai: vamzdžiai, kabeliai, latakai, siūlės – m; dangos, dažymas, tinkavimas, hidroizoliacija – m²; atliekos, gruntas – m³ arba T; keičiami daiktai – Vnt.; rinkiniai – Komplektas.
- Kiekį nurodyk, jei jį galima nustatyti iš aprašymo, matmenų ar nuotraukų. Jei galima tik apytiksliai įvertinti – pateik pagrįstą preliminarų kiekį ir pastabose parašyk „preliminarus, tikslinti vietoje“. Jei kiekio nustatyti neįmanoma – kiekis null ir pastaba, ką išmatuoti.

Papildomi klausimai:
- Jei trūksta informacijos, kuri ESMINGAI pakeistų aktą (pvz., nežinomas pažeisto ploto dydis, kai reikia kiekių; neaišku, kuri sistema pažeista; neaišku, ar defektas bendrojo naudojimo objekte), grąžink status = "questions" ir iki 5 trumpų, konkrečių klausimų su galimais atsakymų variantais.
- Neklausk to, kas jau aprašyta ar matyti nuotraukose. Neklausk smulkmenų, kurias galima pažymėti kaip prielaidą.
- Jei force = true arba į klausimus jau atsakyta ir informacijos pakanka – NEKLAUSK, o parenk aktą, o neaiškumus surašyk į assumptions.

Pastato kontekstas ir išsamumas:
- Jei pateiktas „PASTATO KONTEKSTAS“, atsižvelk į jį: blokinių ir plytinių namų defektų priežastys bei remonto sprendimai skiriasi (pvz., blokiniuose – tarppanelinių siūlių sandarinimas, plytiniuose – mūro remontas); stogo tipas ir danga lemia darbų pobūdį ir medžiagas; stogo, rūsio ir kitus plotus naudok tik kaip foną ir viršutinę ribą kiekiams – pažeisto ploto neišgalvok. Faktai iš inžinieriaus aprašymo ir nuotraukų turi pirmenybę.
- Laikykis nurodyto „APRAŠYMO IŠSAMUMO“ lygio (siaurai / vidutiniškai / plačiai): jis nustato, kiek išsamiai rašai problemą, defektus, darbus ir išvadą.

Inžinieriaus bendri pageidavimai:
- Jei pateikti „INŽINIERIAUS BENDRI PAGEIDAVIMAI“, laikykis jų kaip nuolatinių rašymo ir turinio taisyklių, nebent jos prieštarauja šio akto faktams.
- Kai inžinierius prašo pataisyti aktą, laukelyje lesson įrašyk bendrą taisyklę tik jei nurodymas tinka ir kitiems aktams.

${DOCS_RULES}

Rezultatą VISADA pateik iškviesdamas įrankį „pateikti_rezultata“.`;

const ACT_TOOL = {
  name: 'pateikti_rezultata',
  description: 'Pateikia sugeneruotus aktus arba papildomus klausimus inžinieriui.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string', enum: ['questions', 'ready'],
        description: '"questions" – reikia papildomos informacijos; "ready" – aktai paruošti.'
      },
      questions: {
        type: 'array', description: 'Klausimai inžinieriui (tik kai status = questions).',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            why: { type: 'string', description: 'Trumpai, kam reikalinga ši informacija.' },
            suggestions: { type: 'array', items: { type: 'string' }, description: 'Galimi atsakymų variantai (2–4).' }
          },
          required: ['question']
        }
      },
      defect_act: {
        type: 'object', description: 'Defektavimo aktas (kai status = ready).',
        properties: {
          purpose: { type: 'string', description: 'Apžiūros tikslas, pvz. „Neeilinė apžiūra gavus gyventojo pranešimą“.' },
          problem: { type: 'string', description: 'Trumpas problemos aprašas vienu sakiniu.' },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                system: { type: 'string', description: 'Apžiūrėtas objektas / sistema.' },
                defects: { type: 'string', description: 'Pastebėti defektai, deformacijos, gedimai.' },
                works: { type: 'string', description: 'Rekomenduojami darbai defektams pašalinti.' },
                photos: { type: 'array', items: { type: 'integer' }, description: 'Susijusių nuotraukų numeriai.' }
              },
              required: ['system', 'defects', 'works']
            }
          },
          urgency: { type: 'string', enum: ['Avarinis', 'Skubus', 'Planinis'], description: 'Darbų skubumas.' },
          summary: { type: 'string', description: 'Trumpa išvada 1–3 sakiniai: kas nustatyta ir kas rekomenduojama.' }
        },
        required: ['purpose', 'problem', 'objects', 'urgency', 'summary']
      },
      works_act: {
        type: ['object', 'null'], description: 'Numatomų darbų aktas – tik kai režimas full, kitaip null.',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                section: { type: 'string', description: 'Skyrius, pvz. „Atliekami darbai“, „Medžiagos“, „Kiti darbai“.' },
                description: { type: 'string' },
                unit: { type: 'string', description: 'Mato vienetas iš leistino sąrašo.' },
                qty: { type: ['number', 'null'] },
                notes: { type: 'string' }
              },
              required: ['section', 'description', 'unit']
            }
          },
          note: { type: 'string', description: 'Pastaba po lentele, pvz. „Kiekius vietoje patikslins rangovas.“' }
        },
        required: ['rows']
      },
      assumptions: {
        type: 'array', items: { type: 'string' },
        description: 'Prielaidos, kurias padarei dėl trūkstamos informacijos (rodomos tik inžinieriui).'
      },
      lesson: { type: 'string', description: LESSON_DESC }
    },
    required: ['status']
  }
};

function imageBlock(p) {
  if (p.url) return { type: 'image', source: { type: 'url', url: p.url } };
  if (p.data) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(p.data);
    if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  }
  return null;
}

function line(label, value) {
  return value ? `${label}: ${value}\n` : '';
}

// Inžinieriaus bendri pageidavimai, išmokti iš ankstesnių pataisymų (siunčia naršyklė).
function lessonsBlock(payload) {
  const ls = (payload.lessons || []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 30);
  if (!ls.length) return '';
  return '\nINŽINIERIAUS BENDRI PAGEIDAVIMAI (išmokta iš ankstesnių pataisymų – taikyk šiame akte, nebent prieštarauja faktams):\n' +
    ls.map((x, i) => `${i + 1}. ${x}`).join('\n') + '\n';
}


/**
 * payload = {
 *   mode: 'defect' | 'full', force: bool, instruction?: string,
 *   task: {address, city, apartment, stairwell, service_type, problem, description,
 *          field_notes, inspection_purpose, priority},
 *   qa: [{question, answer}],
 *   current?: {defect_act, works_act},
 *   photos: [{n, caption, annotated, url? | data?}]
 * }
 */
export function buildActRequest(payload, model = DEFAULT_MODEL) {
  const t = payload.task || {};
  const content = [];

  let text = `REŽIMAS: ${payload.mode === 'full'
    ? 'full – parengti defektavimo aktą IR numatomų darbų aktą su mato vienetais ir kiekiais'
    : 'defect – parengti TIK defektavimo aktą su rekomendacijomis (works_act = null)'}\n`;
  text += `force = ${payload.force ? 'true (klausimų neužduoti)' : 'false'}\n\n`;
  text += detailBlock(payload);
  text += 'UŽDUOTIES DUOMENYS\n';
  text += line('Adresas', [t.address, t.city].filter(Boolean).join(', '));
  text += line('Butas', t.apartment);
  text += line('Laiptinė', t.stairwell);
  text += line('Paslauga / darbų sritis', t.service_type);
  text += line('Apžiūros tikslas', t.inspection_purpose);
  text += line('Prioritetas', t.priority);
  text += line('Problema (užduotyje)', t.problem);
  if (t.description) text += `\nGYVENTOJO / UŽSAKOVO PRANEŠIMAS:\n${t.description}\n`;
  text += `\nINŽINIERIAUS APRAŠYMAS VIETOJE:\n${t.field_notes || '(neaprašyta)'}\n`;

  const qa = (payload.qa || []).filter(x => x && x.question);
  if (qa.length) {
    text += '\nANKSČIAU UŽDUOTI KLAUSIMAI IR INŽINIERIAUS ATSAKYMAI:\n';
    qa.forEach((x, i) => { text += `${i + 1}. K: ${x.question}\n   A: ${x.answer || '(neatsakyta)'}\n`; });
  }

  if (payload.instruction && payload.current) {
    text += '\nDABARTINIS AKTO VARIANTAS (JSON):\n' + JSON.stringify(payload.current) + '\n';
    text += `\nINŽINIERIAUS NURODYMAS, KAIP PATAISYTI: ${payload.instruction}\n`;
    text += 'Pataisyk aktą pagal nurodymą, kitas dalis palik nepakeistas. Klausimų neužduok.\n';
  } else if (payload.instruction) {
    text += `\nPAPILDOMAS INŽINIERIAUS NURODYMAS: ${payload.instruction}\n`;
  }
  text += buildingBlock(payload);
  text += lessonsBlock(payload);

  const photos = (payload.photos || []).slice(0, MAX_PHOTOS);
  text += photos.length
    ? `\nPRIDEDAMA NUOTRAUKŲ: ${photos.length}. Jos pateiktos žemiau eilės tvarka.\n`
    : '\nNUOTRAUKŲ NĖRA.\n';
  content.push({ type: 'text', text });

  (payload.docs || []).slice(0, 3).forEach(d => {
    const b = docBlock(d);
    if (!b) return;
    content.push({ type: 'text', text: `PROJEKTO DOKUMENTAS: ${d.name || ''}` });
    content.push(b);
  });

  photos.forEach((p, i) => {
    const n = p.n || i + 1;
    const block = imageBlock(p);
    if (!block) return;
    content.push({ type: 'text', text: `${n} pav.${p.caption ? ' – ' + p.caption : ''}${p.annotated ? ' (su inžinieriaus žymėjimais)' : ''}` });
    content.push(block);
  });

  content.push({ type: 'text', text: 'Pateik rezultatą per įrankį „pateikti_rezultata“.' });

  return {
    model,
    max_tokens: 8000,
    system: ACT_SYSTEM,
    tools: [ACT_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }]
  };
}

// ---------------------------------------------------------------------
// Neatikties aktas (rangovo darbų neatitiktys)
// ---------------------------------------------------------------------

const NC_SYSTEM = `Tu esi patyręs statybos / techninės priežiūros darbų kokybės kontrolės inžinierius Lietuvoje. Padedi techniniam inžinieriui parengti NEATIKTIES AKTĄ: dokumentą, kuriame fiksuojama, kad rangovo atlikti (ar atliekami) darbai neatitinka projekto, techninių reikalavimų, normų ar gerosios praktikos.

Rašymo taisyklės:
- Rašyk taisyklinga, dalykine lietuvių kalba, trumpais techniniais sakiniais, kaip oficialiuose aktuose. Jokių kreipinių ar paaiškinimų vartotojui aktų laukuose.
- Remkis TIK inžinieriaus aprašymu (jis gali būti padiktuotas, su klaidomis) ir nuotraukomis. Neišgalvok neatitikčių, kurių nėra aprašyme ar nuotraukose.
- Nuotraukos sunumeruotos („1 pav.“, „2 pav.“ ...). Spalvoti kontūrai, rodyklės ir skaičiai apskritimuose nuotraukose – inžinieriaus pažymėtos vietos. Kiekvienai neatitiktis nurodyk susijusias nuotraukas (laukas photos).
- Kiekviena atskira neatiktis – atskira eilutė: ką rangovas padarė ar nepadarė (description – faktas, be vertinimų), kokį reikalavimą pažeidžia (requirement) ir ką rangovas privalo padaryti (action).
- requirement: nurodyk reikalavimą, kurį pažeidžia (projektas, techninė specifikacija, gamintojo montavimo instrukcija, darbų kokybės reikalavimai), ir PAGRINDĄ PAGAL STR: eilutės pabaigoje skliaustuose pateik 1–2 tinkamiausias nuorodas iš žemiau pateikto STR žinyno, pvz. „(STR 1.07.03:2017 13.1 p. – išorės atitvarų drėgmę izoliuojantys įrenginiai turi būti tvarkingi; STR 2.01.01(3):1999)“ – su trumpa reikšme iš žinyno. Neatitiktis turi būti paremta STR, todėl nuorodą pridėk prie kiekvienos eilutės, kai žinyne yra tinkama norma.
- Nuorodas imk TIK iš žinyno (punktų numerius – tik iš A–C dalių). Jei tinkamos normos žinyne nėra arba nesi tikras – rašyk bendrai („Pagal projekto sprendinius ir statybos darbų kokybės reikalavimus“) ir įrašyk į assumptions „Patikrinti STR pagrindą: <neatiktis>“. Neišgalvok normų ar jų punktų.
- action: konkretus taisymo veiksmas (pvz., „Išardyti ir pakartotinai sumontuoti pagal gamintojo instrukciją“, „Pašalinti ir atstatyti dangą“).
- severity (neatitikties lygis): „Nežymi“ – estetinis ar menkas, nedaro įtakos saugai / patvarumui; „Esminė“ – mažina patvarumą, funkcionalumą ar kokybę, reikia taisyti; „Kritinė“ – kelia pavojų saugai ar sukels avariją, darbus reikia stabdyti. Pasirink aukščiausią tarp neatitikčių.
- work: kokie rangovo darbai vertinami (pvz., „Stogo dangos remontas“). Jei neaišku – naudok užduoties duomenis.
- summary: 1–3 sakiniai: kas nustatyta ir ko reikalaujama.
- Jokių klausimų: jei kažko trūksta, parink protingą formuluotę ir įrašyk į assumptions.

Pastato kontekstas:
- Jei pateiktas „PASTATO KONTEKSTAS“, atsižvelk į jį vertindamas neatitiktis ir reikalavimus (konstruktyvas, stogo tipas ir danga, plotai, šilumos punktas). Faktai iš inžinieriaus aprašymo ir nuotraukų turi pirmenybę.

${STR_REFERENCE}

Inžinieriaus bendri pageidavimai:
- Jei pateikti „INŽINIERIAUS BENDRI PAGEIDAVIMAI“, laikykis jų kaip nuolatinių rašymo ir turinio taisyklių, nebent jos prieštarauja šio akto faktams.
- Kai inžinierius prašo pataisyti aktą, laukelyje lesson įrašyk bendrą taisyklę tik jei nurodymas tinka ir kitiems aktams.

${DOCS_RULES}

Rezultatą VISADA pateik iškviesdamas įrankį „pateikti_neatiktis“.`;

const NC_TOOL = {
  name: 'pateikti_neatiktis',
  description: 'Pateikia sugeneruotą neatikties aktą.',
  input_schema: {
    type: 'object',
    properties: {
      work: { type: 'string', description: 'Vertinami rangovo darbai.' },
      severity: { type: 'string', enum: ['Nežymi', 'Esminė', 'Kritinė'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Nustatyta neatiktis (faktas).' },
            requirement: { type: 'string', description: 'Pažeidžiamas reikalavimas.' },
            action: { type: 'string', description: 'Ką rangovas privalo padaryti.' },
            photos: { type: 'array', items: { type: 'integer' }, description: 'Susijusių nuotraukų numeriai.' }
          },
          required: ['description', 'requirement', 'action']
        }
      },
      summary: { type: 'string', description: 'Trumpa išvada ir reikalavimas rangovui.' },
      assumptions: { type: 'array', items: { type: 'string' }, description: 'Prielaidos, kurias padarei (rodomos tik inžinieriui).' },
      lesson: { type: 'string', description: LESSON_DESC }
    },
    required: ['work', 'severity', 'items', 'summary']
  }
};

/**
 * payload = {
 *   instruction?: string, current?: nc_act,
 *   task: {address, city, stairwell, contractor, work_name, problem, description, field_notes, inspection_date},
 *   photos: [{n, caption, annotated, url? | data?}]
 * }
 */
export function buildNcRequest(payload, model = DEFAULT_MODEL) {
  const t = payload.task || {};
  const content = [];

  let text = 'UŽDUOTIES DUOMENYS\n';
  text += line('Objektas / adresas', [t.address, t.city].filter(Boolean).join(', '));
  text += line('Laiptinė', t.stairwell);
  text += line('Rangovas', t.contractor);
  text += line('Darbai', t.work_name);
  text += line('Nustatymo data', t.inspection_date);
  text += line('Neatikties santrauka (užduotyje)', t.problem);
  if (t.description) text += `\nPAPILDOMA INFORMACIJA:\n${t.description}\n`;
  text += `\nINŽINIERIAUS APRAŠYMAS (gali būti padiktuotas):\n${t.field_notes || '(neaprašyta)'}\n`;

  if (payload.instruction && payload.current) {
    text += '\nDABARTINIS AKTO VARIANTAS (JSON):\n' + JSON.stringify(payload.current) + '\n';
    text += `\nINŽINIERIAUS NURODYMAS, KAIP PATAISYTI: ${payload.instruction}\n`;
    text += 'Pataisyk aktą pagal nurodymą, kitas dalis palik nepakeistas.\n';
  }
  text += buildingBlock(payload);
  text += lessonsBlock(payload);

  const photos = (payload.photos || []).slice(0, MAX_PHOTOS);
  text += photos.length
    ? `\nPRIDEDAMA NUOTRAUKŲ: ${photos.length}. Jos pateiktos žemiau eilės tvarka.\n`
    : '\nNUOTRAUKŲ NĖRA.\n';
  content.push({ type: 'text', text });

  (payload.docs || []).slice(0, 3).forEach(d => {
    const b = docBlock(d);
    if (!b) return;
    content.push({ type: 'text', text: `PROJEKTO DOKUMENTAS: ${d.name || ''}` });
    content.push(b);
  });

  photos.forEach((p, i) => {
    const n = p.n || i + 1;
    const block = imageBlock(p);
    if (!block) return;
    content.push({ type: 'text', text: `${n} pav.${p.caption ? ' – ' + p.caption : ''}${p.annotated ? ' (su inžinieriaus žymėjimais)' : ''}` });
    content.push(block);
  });

  content.push({ type: 'text', text: 'Pateik rezultatą per įrankį „pateikti_neatiktis“.' });

  return {
    model,
    max_tokens: 5000,
    system: NC_SYSTEM,
    tools: [NC_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }]
  };
}

// ---------------------------------------------------------------------
// Pranešimo (laiško) išskaidymas į užduoties laukus
// ---------------------------------------------------------------------

const PARSE_TOOL = {
  name: 'uzpildyti_uzduoti',
  description: 'Užpildo užduoties laukus iš gyventojo ar vadybininko pranešimo.',
  input_schema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'Gatvė ir namo numeris, be buto, pvz. „Taikos pr. 55“.' },
      city: { type: 'string' },
      apartment: { type: 'string', description: 'Buto numeris, jei nurodytas.' },
      stairwell: { type: 'string', description: 'Laiptinės numeris, jei nurodytas.' },
      entry_code: { type: 'string', description: 'Laiptinės / durų kodas, jei nurodytas.' },
      contact_name: { type: 'string' },
      contact_phone: { type: 'string', description: 'Telefono numeris formatu +370...' },
      problem: { type: 'string', description: 'Trumpas problemos aprašas (iki 12 žodžių), pvz. „Pratekėjimas per lietų į 7 laiptinės el. skydinę“.' },
      service_type: { type: 'string', description: 'Tinkamiausia paslauga iš pateikto sąrašo.' },
      priority: { type: 'string', enum: ['skubus', 'iprastas', 'zemas'] }
    }
  }
};

export function buildParseRequest(text, serviceTypes = [], model = DEFAULT_MODEL) {
  return {
    model,
    max_tokens: 1500,
    system: 'Iš pranešimo apie daugiabučio namo gedimą ištrauk užduoties duomenis. Nežinomus laukus praleisk (neišgalvok). Taisyk akivaizdžias rašybos klaidas adresuose (pvz., „Klaipeda“ → „Klaipėda“). Atsakymą pateik per įrankį „uzpildyti_uzduoti“.',
    tools: [PARSE_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{
      role: 'user',
      content: `Galimos paslaugos:\n- ${serviceTypes.join('\n- ')}\n\nPRANEŠIMAS:\n${text}`
    }]
  };
}

// ---------------------------------------------------------------------
// Bendros pagalbinės funkcijos
// ---------------------------------------------------------------------

/** Ištraukia įrankio įvestį iš Claude atsakymo (arba JSON iš teksto). */
export function extractToolInput(response, toolName) {
  const blocks = (response && response.content) || [];
  const tool = blocks.find(b => b.type === 'tool_use' && (!toolName || b.name === toolName));
  if (tool) return tool.input;
  const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) { /* ignore */ }
  }
  throw new Error('DI negrąžino struktūrizuoto atsakymo. Bandykite dar kartą.');
}

/** Iškviečia Claude API. extraHeaders – pvz. naršyklės demo režimui. */
export async function callAnthropic(apiKey, body, extraHeaders = {}) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || res.statusText;
    throw new Error(`Claude API klaida (${res.status}): ${msg}`);
  }
  return data;
}

/** Vienas įėjimo taškas: action = 'generate_act' | 'generate_nc' | 'parse_task'. */
export async function runAction(apiKey, model, action, payload, extraHeaders = {}) {
  if (action === 'parse_task') {
    const body = buildParseRequest(payload.text || '', payload.service_types || [], model);
    const resp = await callAnthropic(apiKey, body, extraHeaders);
    return extractToolInput(resp, PARSE_TOOL.name);
  }
  if (action === 'generate_act') {
    const body = buildActRequest(payload, model);
    const resp = await callAnthropic(apiKey, body, extraHeaders);
    const out = extractToolInput(resp, ACT_TOOL.name);
    if (payload.mode !== 'full') out.works_act = null;
    if (payload.force && out.status === 'questions' && !out.defect_act) {
      throw new Error('DI vis dar prašo papildomos informacijos. Papildykite aprašymą.');
    }
    out.usage = resp.usage || null;
    return out;
  }
  if (action === 'generate_nc') {
    const body = buildNcRequest(payload, model);
    const resp = await callAnthropic(apiKey, body, extraHeaders);
    const out = extractToolInput(resp, NC_TOOL.name);
    out.usage = resp.usage || null;
    return out;
  }
  throw new Error('Nežinomas veiksmas: ' + action);
}


// Supabase Edge Function „ai“ – saugiai kviečia Claude API.
// API raktas laikomas Supabase paslaptyse (secrets), naršyklė jo nemato.
//
// Diegimas per CLI:
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   npx supabase functions deploy ai --no-verify-jwt
// (neprivaloma) npx supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5
//
// Vartotojas tikrinamas pačiame kode (veikia ir su naujais „publishable“,
// ir su senais „anon“ raktais), todėl platformos JWT tikrinimas išjungtas.


const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

function projectApiKey(req: Request): string {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (first) return String(first);
  } catch (_) { /* ignore */ }
  return req.headers.get('apikey') || '';
}

/** Patikrina, ar užklausą siuntė prisijungęs IR aktyvuotas vartotojas. */
async function getUser(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: projectApiKey(req) }
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;
  // paskyra turi būti aktyvuota (profiles.active); RLS leidžia skaityti savo profilį
  const pr = await fetch(`${url}/rest/v1/profiles?select=active&id=eq.${user.id}`, {
    headers: { Authorization: auth, apikey: projectApiKey(req) }
  });
  if (!pr.ok) return null;
  const rows = await pr.json();
  return rows && rows[0] && rows[0].active ? user : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: 'Neprisijungta arba paskyra neaktyvuota. Prisijunkite iš naujo.' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Serveryje nenustatytas ANTHROPIC_API_KEY' }, 500);
  const model = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL;

  try {
    const { action, payload } = await req.json();
    const result = await runAction(apiKey, model, action, payload || {});
    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
