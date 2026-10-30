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
      }
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

  const photos = (payload.photos || []).slice(0, MAX_PHOTOS);
  text += photos.length
    ? `\nPRIDEDAMA NUOTRAUKŲ: ${photos.length}. Jos pateiktos žemiau eilės tvarka.\n`
    : '\nNUOTRAUKŲ NĖRA.\n';
  content.push({ type: 'text', text });

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
- requirement: nurodyk reikalavimą, kurį pažeidžia (projektas, techninė specifikacija, gamintojo montavimo instrukcija, STR / RSN norma, darbų kokybės reikalavimai). Konkrečius normų punktus nurodyk TIK jei esi tikras; kitu atveju rašyk bendrai („Pagal projekto sprendinius ir statybos darbų kokybės reikalavimus“) ir tai įrašyk į assumptions.
- action: konkretus taisymo veiksmas (pvz., „Išardyti ir pakartotinai sumontuoti pagal gamintojo instrukciją“, „Pašalinti ir atstatyti dangą“).
- severity (neatitikties lygis): „Nežymi“ – estetinis ar menkas, nedaro įtakos saugai / patvarumui; „Esminė“ – mažina patvarumą, funkcionalumą ar kokybę, reikia taisyti; „Kritinė“ – kelia pavojų saugai ar sukels avariją, darbus reikia stabdyti. Pasirink aukščiausią tarp neatitikčių.
- work: kokie rangovo darbai vertinami (pvz., „Stogo dangos remontas“). Jei neaišku – naudok užduoties duomenis.
- summary: 1–3 sakiniai: kas nustatyta ir ko reikalaujama.
- Jokių klausimų: jei kažko trūksta, parink protingą formuluotę ir įrašyk į assumptions.

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
      assumptions: { type: 'array', items: { type: 'string' }, description: 'Prielaidos, kurias padarei (rodomos tik inžinieriui).' }
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

  const photos = (payload.photos || []).slice(0, MAX_PHOTOS);
  text += photos.length
    ? `\nPRIDEDAMA NUOTRAUKŲ: ${photos.length}. Jos pateiktos žemiau eilės tvarka.\n`
    : '\nNUOTRAUKŲ NĖRA.\n';
  content.push({ type: 'text', text });

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
