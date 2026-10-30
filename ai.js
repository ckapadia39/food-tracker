/* Gemini layer. The key lives only in this phone's storage and is sent only to Google's API. */
const AI = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const UNITS = 'g, oz, ml, piece, katori, cup, tbsp, tsp, scoop, slice, plate, glass, can, serving';

  function key() { return (window.S && S.settings.apiKey) || ''; }
  function model() { return (window.S && S.settings.model) || 'gemini-2.5-flash'; }

  async function listModels(k) {
    const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(k)}`);
    if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? 'That key was rejected by Google.' : 'Could not reach Google (' + r.status + ').');
    const j = await r.json();
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
  }
  // Pick the newest general-purpose Flash model available on this key.
  function pickModel(names) {
    const ok = names.filter(n => /flash/.test(n) && !/(lite|image|tts|live|audio|thinking|exp|preview|embed|8b)/.test(n));
    const pool = ok.length ? ok : names.filter(n => /flash/.test(n) && !/(image|tts|live|embed)/.test(n));
    const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    pool.sort((a, b) => ver(b) - ver(a) || (/latest/.test(a) ? -1 : 1));
    return pool[0] || 'gemini-2.5-flash';
  }

  // Gemini "thinking" adds seconds of delay; food parsing doesn't need it. Try the lowest setting the model accepts.
  function thinkOptions(m) {
    if (/gemini-2\.5/.test(m)) return [{ thinkingBudget: 0 }, null];
    if (/gemini-([3-9]|\d\d)/.test(m)) return [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, null];
    return [null];
  }
  const offline = msg => Object.assign(new Error(msg), { offline: true });
  async function call(parts, { json = true, search = false, temperature = 0.2 } = {}) {
    if (!key()) throw new Error('NO_KEY');
    const m = model();
    const opts = thinkOptions(m);
    const memo = (S.settings.thinkIdx = S.settings.thinkIdx || {});
    let idx = Math.min(memo[m] || 0, opts.length - 1);
    for (;;) {
      const body = { contents: [{ role: 'user', parts }], generationConfig: { temperature } };
      if (json && !search) body.generationConfig.responseMimeType = 'application/json';
      if (search) body.tools = [{ google_search: {} }];
      if (opts[idx]) body.generationConfig.thinkingConfig = opts[idx];
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
      let r;
      try {
        r = await fetch(`${BASE}/models/${m}:generateContent?key=${encodeURIComponent(key())}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal
        });
      } catch (e) {
        throw offline(e.name === 'AbortError' ? 'Gemini took too long — saved to try again.' : 'No connection — saved to try again.');
      } finally { clearTimeout(to); }
      if (r.status === 429) throw new Error('Gemini free limit reached for the moment. Wait a minute and try again.');
      if (!r.ok) {
        let msg = ''; try { msg = (await r.json()).error.message; } catch (e) {}
        if (r.status === 400 && /think/i.test(msg) && idx < opts.length - 1) { idx++; memo[m] = idx; continue; }
        if (r.status >= 500) throw offline('Gemini is busy — saved to try again.');
        throw new Error('Gemini error ' + r.status + (msg ? ': ' + msg.slice(0, 160) : ''));
      }
      if (memo[m] !== idx) memo[m] = idx;
      let j; try { j = await r.json(); } catch (e) { throw offline('Connection dropped — saved to try again.'); }
      const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (!json) return text;
      return parseJSON(text);
    }
  }
  function parseJSON(t) {
    try { return JSON.parse(t); } catch (e) {}
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\})/);
    if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
    throw new Error('The AI reply could not be read. Try again.');
  }

  const ITEM_SCHEMA = `{
 "transcript": string,                       // what the user said (for voice) or a cleaned copy of the text
 "day_type": null | "normal" | "veg" | "fasting",
 "slot": null | one of SLOTS,
 "copy": null | { "days_ago": number, "slot": one of SLOTS },
 "items": [ {
   "name": string,                           // short food name as the user would say it
   "match_id": string | null,                // id from CATALOG when it is the same food & preparation
   "qty": number, "unit": string,            // unit from: ${UNITS}
   "grams": number,                          // best estimate of total grams eaten
   "state": "raw" | "cooked" | "dry",
   "est_per100": null | {"kcal":n,"p":n,"c":n,"f":n,"fib":n},  // REQUIRED when match_id is null; per 100 g in "state"
   "note": string                            // optional, very short
 } ],
 "questions": [string]                       // only if something is truly ambiguous
}`;

  const RULES = `Rules:
- Split into separate foods, except: when the user describes how a home-cooked dish was made (ingredients, oil/ghee, spices), output ONE item for the finished dish with est_per100 computed from those ingredients and grams = the portion eaten.
- Prefer match_id from CATALOG when it is genuinely the same food. Ids starting "my:" are the user's own saved foods and dishes — prefer them when the name matches.
- Raw vs cooked defaults when not stated: meat, chicken, fish, paneer, tofu are weighed RAW; rice, dals, beans, pasta, sabzi, curries are COOKED; poha, oats, flours, nuts, seeds, powders are DRY. If the user says "cooked", "raw", "uncooked", "dry", use that.
- Counts of rotis, eggs, dates, almonds, dosas, idlis etc. use unit "piece". "a bowl" = katori. "a glass" = glass.
- grams must always be filled (estimate realistic Indian home portions: roti ~40 g, katori ~150 g, etc.).
- est_per100 uses authentic typical recipes (Gujarati, Punjabi, South Indian etc.) and the user's description.
- slot: map words like breakfast/lunch/dinner/snack/"after waking"/"before bed" to the closest of SLOTS; otherwise null.
- day_type: "today is my fasting day / upvas / vrat" -> fasting; "veg day" -> veg; otherwise null.
- copy: for "same as yesterday's lunch" etc. Leave items empty in that case.
- Numbers only, no units inside numbers. Return JSON only.`;

  function ctxText(ctx) {
    return `SLOTS: ${JSON.stringify(ctx.slots)}
Current local time: ${ctx.time}. Today's day type: ${ctx.dayType}.
CATALOG (id|name|also called):
${ctx.catalog}`;
  }

  async function parseMeal(text, ctx) {
    const prompt = `You are the food-logging parser for a personal nutrition tracker. The user is Indian-American, mostly eats Indian home-cooked food (often Gujarati), sometimes non-veg, and logs in English mixed with Hindi/Gujarati food words.
${ctxText(ctx)}

USER SAID: """${text}"""

Return JSON with this shape:
${ITEM_SCHEMA}
${RULES}`;
    return call([{ text: prompt }]);
  }

  async function parseAudio(b64, mime, ctx) {
    const prompt = `You are the food-logging parser for a personal nutrition tracker. Listen to the recording: the user (Indian-American, mostly Indian home-cooked food, often Gujarati, sometimes non-veg) says what they ate, mixing English with Hindi/Gujarati food words. Transcribe it, then convert it into log items.
${ctxText(ctx)}

Return JSON with this shape:
${ITEM_SCHEMA}
${RULES}`;
    return call([{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }]);
  }

  async function mealPhoto(b64, ctx, hint) {
    const prompt = `Identify every food on this plate/photo and estimate each portion. The user mostly eats Indian home food. ${hint ? 'User note: ' + hint : ''}
${ctxText(ctx)}
Return JSON with this shape:
${ITEM_SCHEMA}
${RULES}`;
    return call([{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }]);
  }

  async function menuPhoto(b64, ctx, hint) {
    const prompt = `This is a photo or screenshot of a restaurant menu, receipt, or food-delivery order. List the foods the user ordered (if a menu, the items they mention in the note; otherwise everything ordered) as log items with realistic restaurant portion sizes and nutrition. If it is a known chain that publishes nutrition, use those values. User note: ${hint || '(none)'}
${ctxText(ctx)}
Return JSON with this shape:
${ITEM_SCHEMA}
${RULES}`;
    return call([{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }]);
  }

  async function label(b64) {
    const prompt = `Read the nutrition facts label (and product name/brand if visible) in this photo. Return JSON:
{"name": string, "brand": string, "serving_desc": string, "serving_g": number|null, "servings_per_container": number|null,
 "per_serving": {"kcal":n,"p":n,"c":n,"f":n,"fib":n},
 "per100": {"kcal":n,"p":n,"c":n,"f":n,"fib":n} | null,
 "state": "raw"|"cooked"|"dry"}
Use per100 only if the label prints a per-100 g column, otherwise compute it from serving_g. Use 0 for values not shown. JSON only.`;
    return call([{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }]);
  }

  async function barcodeDigits(b64) {
    return call([{ inline_data: { mime_type: 'image/jpeg', data: b64 } },
      { text: 'Read the barcode number (EAN/UPC digits printed under the bars) in this photo. Return JSON {"code": "digits only" | null}.' }]);
  }

  async function dish(text, ctx) {
    const prompt = `The user is describing a dish they cook at home so the app can save it. Work out its nutrition from the ingredients.
User description: """${text}"""
${ctxText(ctx)}
Return JSON:
{"name": string, "aliases": [string],
 "ingredients": [{"name": string, "grams": number, "state": "raw"|"cooked"|"dry", "kcal":n,"p":n,"c":n,"f":n,"fib":n}],  // nutrition = totals for that amount
 "total_cooked_g": number,          // weight of the finished dish; if not given, estimate (water added, cooking losses)
 "unit": "katori"|"piece"|"plate"|"cup"|"serving", "unit_g": number,  // the natural serving (e.g. 1 dosa = piece, sabzi = katori ~150 g)
 "servings": number,
 "notes": string}
Count oil/ghee fully. Fermented batters: account for water in the batter. JSON only.`;
    return call([{ text: prompt }]);
  }

  async function lookup(name) {
    const prompt = `Find typical nutrition for the dish "${name}" as eaten (home-style/authentic recipe). Search the web if useful. Reply with ONLY a JSON object:
{"name": string, "state": "cooked"|"raw"|"dry", "per100": {"kcal":n,"p":n,"c":n,"f":n,"fib":n}, "unit": "katori"|"piece"|"plate"|"cup"|"serving", "unit_g": number, "notes": string}`;
    const t = await call([{ text: prompt }], { json: false, search: true });
    return parseJSON(t);
  }

  async function plan(b64, text) {
    const prompt = `Convert this diet plan into JSON. Keep every food exactly as written with its quantity and nutrition (if the plan gives nutrition use it as-is; if not, estimate). Group by meal.
Return JSON: {"plans":[{"name": string, "slots":[{"name": string, "items":[{"name": string, "qty": string, "kcal":n,"p":n,"c":n,"f":n,"fib":n}]}]}]}
If the plan has several days or variants, return each as its own entry in "plans". JSON only.
${text ? 'PLAN TEXT:\n' + text : ''}`;
    const parts = b64 ? [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }] : [{ text: prompt }];
    return call(parts);
  }

  async function ideas(ctx, remaining, slot, planItems, dayType) {
    const prompt = `Suggest 3 realistic options for what the user can eat now for "${slot}". Day type: ${dayType} (veg = no meat/fish/eggs; fasting = Indian vrat/upvas-friendly foods only: no grains or regular salt-based meals, e.g. sabudana, rajgira, moraiyo, fruits, milk, nuts, potatoes).
Remaining for today: ${JSON.stringify(remaining)} (kcal and grams).
Planned for this meal: ${planItems || '(none)'}.
Prefer foods from the user's own list: ${ctx.myNames || '(none)'}. Mostly Indian home food.
Each option should fit within the remaining calories and prioritise protein.
Return JSON: {"ideas":[{"title": string, "why": string, "items":[{"name": string, "qty": number, "unit": string, "grams": number, "state":"raw"|"cooked"|"dry", "kcal":n,"p":n,"c":n,"f":n,"fib":n}]}]}`;
    return call([{ text: prompt }], { temperature: 0.6 });
  }

  return { listModels, pickModel, parseMeal, parseAudio, mealPhoto, menuPhoto, label, barcodeDigits, dish, lookup, plan, ideas };
})();
