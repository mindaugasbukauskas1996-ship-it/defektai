// Pasirinkimas, kuriuo DI formuoti aktus: Claude (Anthropic) arba ChatGPT (OpenAI).
// Pasirinkimas saugomas vartotojo nustatymuose ir galioja defektų, neatikties ir metinės apžiūros aktams.

import * as db from './data.js';
import { esc } from './util.js';

export const AI_PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'ChatGPT (OpenAI)' }
];

/** HTML pasirinkimo laukui; po įterpimo kviesti bindAiPick(konteineris). */
export function aiPickHtml() {
  return `<label class="ai-pick"><span>DI modelis:</span>
    <select data-ai-pick>${AI_PROVIDERS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></label>`;
}

/** Užpildo pasirinkimą išsaugota reikšme ir įrašo pakeitimus. */
export function bindAiPick(root) {
  const sel = root.querySelector('[data-ai-pick]');
  if (!sel) return;
  db.getAiProvider().then(v => { sel.value = v; });
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try { await db.setAiProvider(sel.value); } catch (_) { /* nepavyko išsaugoti – galios tik šiam kartui */ }
    sel.disabled = false;
  });
}
