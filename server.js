require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieSession({
  name: 'ciotr_auth',
  secret: process.env.SESSION_SECRET || 'ciotr-secret-key',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
}));

const APP_PASSWORD = process.env.APP_PASSWORD || 'GameChanger45!';

app.get('/login', (req, res) => {
  if (req.session.authed) return res.redirect('/');
  const error = req.query.error ? '<p style="color:#f87171;margin:0 0 16px">Incorrect password.</p>' : '';
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CIOTR CMS — Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f1117;color:#f0f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#181c27;border:1px solid #2d3348;border-radius:16px;padding:40px;width:100%;max-width:380px;box-shadow:0 24px 64px rgba(0,0,0,.6)}.logo{font-size:32px;margin-bottom:16px}.title{font-size:20px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:#6b7599;margin-bottom:28px}input{width:100%;height:44px;background:#1e2233;border:1px solid #374060;border-radius:8px;padding:0 14px;color:#f0f2f8;font-size:14px;margin-bottom:16px;outline:none}input:focus{border-color:#4f8ef7;box-shadow:0 0 0 3px rgba(79,142,247,.15)}button{width:100%;height:44px;background:#4f8ef7;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}button:hover{background:#6ba3fa}</style></head><body><div class="card"><div class="logo">❄️</div><div class="title">CIOTR CMS Automation</div><div class="sub">Cold is on the Right · Location Page Generator</div>${error}<form method="POST" action="/login"><input type="password" name="password" placeholder="Password" autofocus><button type="submit">Sign In</button></form></div></body></html>`);
});

app.post('/login', (req, res) => {
  if (req.body.password === APP_PASSWORD) {
    req.session.authed = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  res.redirect('/login');
}

app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Per-location collection IDs ─────────────────────────────────────────────
const COLLECTION_IDS = {
  'Lakeway':          process.env.WEBFLOW_COLLECTION_ID,
  'Bee Cave':         process.env.WEBFLOW_COLLECTION_ID_BEE_CAVE,
  'Cedar Park':       process.env.WEBFLOW_COLLECTION_ID_CEDAR_PARK,
  'Dripping Springs': process.env.WEBFLOW_COLLECTION_ID_DRIPPING_SPRINGS,
  'Georgetown':       process.env.WEBFLOW_COLLECTION_ID_GEORGETOWN,
  'Leander':          process.env.WEBFLOW_COLLECTION_ID_LEANDER,
  'Pflugerville':     process.env.WEBFLOW_COLLECTION_ID_PFLUGERVILLE,
  'Round Rock':       process.env.WEBFLOW_COLLECTION_ID_ROUND_ROCK,
  'Spicewood':        process.env.WEBFLOW_COLLECTION_ID_SPICEWOOD,
  'Steiner Ranch':    process.env.WEBFLOW_COLLECTION_ID_STEINER_RANCH,
  'Westlake':         process.env.WEBFLOW_COLLECTION_ID_WESTLAKE,
};

function getCollectionId(location) {
  return COLLECTION_IDS[location] || process.env.WEBFLOW_COLLECTION_ID;
}

// ─── Location slug helper ────────────────────────────────────────────────────
function locationToSlug(location) {
  return location.toLowerCase().replace(/\s+/g, '-');
}

// ─── Related pages for interlinking ─────────────────────────────────────────
const RELATED_PAGES = {
  'plumbing':                        ['plumbing-repairs', 'commercial-plumbing', 'drain-cleaning', 'sewer-line-replacement', 'emergency-plumbing', 'whole-house-repiping', 'leak-detection', 'slab-leak-detection', 'water-softeners', 'garbage-disposal-services', 'gas-line-installation', 'water-filters', 'water-heaters', 'tankless-water-heater-installation', 'water-heater-installation', 'water-heater-repair', 'water-heater-replacement'],
  'hvac':                            ['hvac-maintenance', 'hvac-repair', 'hvac-replacement', 'ac-repair', 'ac-installation', 'ac-replacement', 'commercial-ac-repair', 'mini-splits', 'heat-pump-installation', 'heat-pump-repair', 'heat-pump-replacement', 'furnace-repair', 'furnace-replacement', 'furnace-installation', 'heating-repairs'],
  'plumbing-repairs':                ['emergency-plumbing', 'drain-cleaning', 'leak-detection', 'slab-leak-detection', 'whole-house-repiping', 'sewer-line-replacement', 'garbage-disposal-services', 'gas-line-installation', 'water-heater-repair'],
  'commercial-plumbing':             ['plumbing-repairs', 'drain-cleaning', 'sewer-line-replacement', 'emergency-plumbing', 'water-heaters', 'gas-line-installation', 'commercial-ac-repair'],
  'drain':                           ['drain-cleaning', 'sewer', 'sewer-line-replacement', 'emergency-plumbing', 'plumbing-repairs'],
  'sewer':                           ['drain-cleaning', 'sewer-line-replacement', 'emergency-plumbing', 'leak-detection', 'whole-house-repiping', 'plumbing-repairs'],
  'emergency-plumbing':              ['plumbing-repairs', 'drain-cleaning', 'sewer-line-replacement', 'leak-detection', 'slab-leak-detection', 'water-heater-repair'],
  'whole-house-repiping':            ['plumbing-repairs', 'leak-detection', 'slab-leak-detection', 'water-heaters', 'emergency-plumbing'],
  'leak-detection':                  ['slab-leak-detection', 'emergency-plumbing', 'whole-house-repiping', 'plumbing-repairs'],
  'water-softeners':                 ['water-filters', 'water-heaters', 'plumbing-repairs'],
  'garbage-disposal-services':       ['plumbing-repairs', 'drain-cleaning', 'emergency-plumbing'],
  'gas-line-installation':           ['plumbing-repairs', 'emergency-plumbing', 'commercial-plumbing'],
  'drain-cleaning':                  ['drain', 'sewer', 'sewer-line-replacement', 'emergency-plumbing', 'garbage-disposal-services'],
  'sewer-line-replacement':          ['sewer', 'drain-cleaning', 'whole-house-repiping', 'emergency-plumbing'],
  'slab-leak-detection':             ['leak-detection', 'whole-house-repiping', 'emergency-plumbing', 'plumbing-repairs'],
  'water-filters':                   ['water-softeners', 'water-heaters', 'plumbing-repairs'],
  'water-heaters':                   ['water-heater-repair', 'water-heater-installation', 'water-heater-replacement', 'tankless-water-heater-installation', 'plumbing-repairs'],
  'tankless-water-heater-installation': ['water-heaters', 'water-heater-installation', 'water-heater-replacement', 'water-heater-repair'],
  'water-heater-installation':       ['water-heaters', 'water-heater-repair', 'water-heater-replacement', 'tankless-water-heater-installation'],
  'water-heater-repair':             ['water-heaters', 'water-heater-installation', 'water-heater-replacement', 'emergency-plumbing', 'tankless-water-heater-installation'],
  'water-heater-replacement':        ['water-heaters', 'water-heater-repair', 'water-heater-installation', 'tankless-water-heater-installation'],
  'hvac-maintenance':                ['ac-repair', 'hvac-repair', 'hvac-replacement', 'heat-pump-installation', 'furnace-repair', 'mini-splits'],
  'hvac-repair':                     ['hvac-maintenance', 'hvac-replacement', 'ac-repair', 'furnace-repair', 'heat-pump-repair', 'heating-repairs'],
  'hvac-replacement':                ['hvac-repair', 'hvac-maintenance', 'ac-replacement', 'furnace-replacement', 'heat-pump-replacement'],
  'ac-repair':                       ['hvac-repair', 'ac-replacement', 'hvac-maintenance', 'ac-installation', 'commercial-ac-repair'],
  'ac-installation':                 ['ac-repair', 'ac-replacement', 'hvac-maintenance', 'mini-splits', 'heat-pump-installation'],
  'ac-replacement':                  ['ac-repair', 'ac-installation', 'hvac-replacement', 'heat-pump-replacement'],
  'commercial-ac-repair':            ['hvac-repair', 'hvac-maintenance', 'hvac-replacement', 'ac-repair', 'commercial-plumbing'],
  'mini-splits':                     ['ac-installation', 'hvac-repair', 'hvac-maintenance', 'heat-pump-installation', 'ac-replacement'],
  'heat-pump-installation':          ['heat-pump-repair', 'heat-pump-replacement', 'hvac-maintenance', 'ac-installation', 'mini-splits'],
  'heat-pump-repair':                ['heat-pump-installation', 'heat-pump-replacement', 'hvac-repair', 'hvac-maintenance'],
  'heat-pump-replacement':           ['heat-pump-repair', 'heat-pump-installation', 'hvac-replacement', 'ac-replacement'],
  'furnace-repair':                  ['heating-repairs', 'furnace-replacement', 'furnace-installation', 'hvac-maintenance', 'hvac-repair'],
  'furnace-replacement':             ['furnace-repair', 'furnace-installation', 'heating-repairs', 'hvac-replacement'],
  'furnace-installation':            ['furnace-repair', 'furnace-replacement', 'heating-repairs', 'hvac-maintenance'],
  'heating-repairs':                 ['furnace-repair', 'furnace-replacement', 'furnace-installation', 'hvac-repair', 'heat-pump-repair'],
};
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'webflow-schema.json'), 'utf8'));
const REFERENCE_DIR = path.join(__dirname, 'reference-pages');

const IMAGE_MAP_PATH = path.join(__dirname, 'image-map.json');
const imageMap = fs.existsSync(IMAGE_MAP_PATH)
  ? JSON.parse(fs.readFileSync(IMAGE_MAP_PATH, 'utf8'))
  : {};

const FOLDER_MAP_PATH = path.join(__dirname, 'folder-map.json');
const folderMapData = fs.existsSync(FOLDER_MAP_PATH)
  ? JSON.parse(fs.readFileSync(FOLDER_MAP_PATH, 'utf8'))
  : { folders: {}, pageTypes: {} };

// ─── Asset image cache ───────────────────────────────────────────────────────
// Fetches all Webflow site assets once, indexes by folder ID, and caches for
// ASSET_CACHE_TTL_MS so image selection is fast and API calls are minimal.

let _assetCache = null;
let _assetCacheExpiry = 0;
const ASSET_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function loadAssetCache() {
  const now = Date.now();
  if (_assetCache && now < _assetCacheExpiry) return _assetCache;

  const siteId = process.env.WEBFLOW_SITE_ID;
  const folderIndex = {};

  // Collect all folder IDs we care about so we can skip unrelated assets
  const watchedFolders = new Set();
  for (const cat of Object.values(folderMapData.folders)) {
    if (cat.hero)     watchedFolders.add(cat.hero);
    if (cat.signs)    watchedFolders.add(cat.signs);
    if (cat.benefits) watchedFolders.add(cat.benefits);
  }

  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await webflowRequest('GET', `/v2/sites/${siteId}/assets?limit=${limit}&offset=${offset}`);
    const assets = result.assets || [];

    for (const asset of assets) {
      const url = asset.hostedUrl || asset.url;
      // Webflow v2 REST API returns folderId as a plain string field
      const folderId = asset.folderId || null;

      if (url && folderId && watchedFolders.has(folderId)) {
        if (!folderIndex[folderId]) folderIndex[folderId] = [];
        folderIndex[folderId].push(url);
      }
    }

    const total = result.total || 0;
    offset += assets.length;
    hasMore = assets.length === limit && offset < total;
  }

  _assetCache = folderIndex;
  _assetCacheExpiry = now + ASSET_CACHE_TTL_MS;
  return folderIndex;
}

async function getRandomImageFromFolder(folderId) {
  if (!folderId) return null;
  try {
    const index = await loadAssetCache();
    const urls = index[folderId];
    if (!urls || urls.length === 0) return null;
    return urls[Math.floor(Math.random() * urls.length)];
  } catch {
    return null;
  }
}

async function getImagesForPageType(pageType) {
  const category = folderMapData.pageTypes[pageType];
  const folders  = category ? folderMapData.folders[category] : null;
  if (!folders) return null;

  const [hero, signs, benefits] = await Promise.all([
    getRandomImageFromFolder(folders.hero),
    getRandomImageFromFolder(folders.signs),
    getRandomImageFromFolder(folders.benefits),
  ]);
  return { hero, signs, benefits };
}

const CITY_IMAGE_MAP_PATH = path.join(__dirname, 'city-image-map.json');
const cityImageMap = fs.existsSync(CITY_IMAGE_MAP_PATH)
  ? JSON.parse(fs.readFileSync(CITY_IMAGE_MAP_PATH, 'utf8'))
  : {};

// ─── Static data ────────────────────────────────────────────────────────────

const LOCATIONS = {
  'Bee Cave': 'Upscale suburb west of Austin. Newer homes, Lake Travis area. Residents expect premium service and have higher budgets. Many newer construction homes with modern plumbing and HVAC systems.',
  'Cedar Park': 'Large, fast-growing suburb north of Austin. Mix of new developments and established 10-20 year old neighborhoods. High density of families. Wide range of home ages means varied plumbing and HVAC needs.',
  'Dripping Springs': 'Semi-rural Hill Country community west of Austin. Custom homes and acreage properties. Well water is common, septic systems frequent. Longer distances between homes, residents value reliability.',
  'Georgetown': 'Fast-growing city north of Austin. Mix of a historic downtown district and massive newer master-planned developments. Wide range of home ages from historic to brand new construction.',
  'Lakeway': 'Established lakeside community on Lake Travis. Mix of older 1970s-90s homes and newer builds. Lake proximity means humidity-related issues. Loyal community that values long-term relationships.',
  'Leander': 'Rapidly growing suburb north of Austin. Lots of new construction. Many first-time homeowners unfamiliar with their systems. Young families, heavy demand for reliable service.',
  'Pflugerville': 'Large suburb northeast of Austin. Established neighborhoods, diverse community. Mix of 1990s-2000s era homes alongside newer developments. Value-conscious homeowners.',
  'Round Rock': 'Major suburb north of Austin. Mix of home ages from 1980s to present. Large population, high demand for service. Tech-savvy community that does research before hiring.',
  'Spicewood': 'Rural Hill Country west of Austin. Acreage properties, well water is very common, septic systems widespread. Remoteness means residents need contractors they can fully trust to show up and get it right.',
  'Steiner Ranch': 'Master-planned lakeside community northwest of Austin. Newer upscale homes, many built 2000-2015. HOA community, residents expect polished professional service. Lake Travis proximity.',
  'Westlake': 'Affluent, established community west of Austin. Older luxury homes from 1970s-1990s, mature trees. Aging plumbing and HVAC systems are common. High expectations for expertise with older premium systems.',
};

const PAGE_TYPE_NAMES = {
  'plumbing': 'Plumbing Services',
  'plumbing-repairs': 'Plumbing Repairs',
  'commercial-plumbing': 'Commercial Plumbing',
  'drain': 'Drain Services',
  'sewer': 'Sewer Services',
  'emergency-plumbing': 'Emergency Plumbing',
  'whole-house-repiping': 'Whole House Repiping',
  'leak-detection': 'Leak Detection',
  'water-softeners': 'Water Softeners',
  'garbage-disposal-services': 'Garbage Disposal Services',
  'gas-line-installation': 'Gas Line Installation',
  'drain-cleaning': 'Drain Cleaning',
  'sewer-line-replacement': 'Sewer Line Replacement',
  'slab-leak-detection': 'Slab Leak Detection',
  'water-filters': 'Water Filters & Filtration',
  'water-heaters': 'Water Heaters',
  'tankless-water-heater-installation': 'Tankless Water Heater Installation',
  'water-heater-installation': 'Water Heater Installation',
  'water-heater-repair': 'Water Heater Repair',
  'water-heater-replacement': 'Water Heater Replacement',
  'hvac': 'HVAC Services',
  'hvac-maintenance': 'HVAC Maintenance',
  'hvac-repair': 'HVAC Repair',
  'hvac-replacement': 'HVAC Replacement',
  'ac-repair': 'AC Repair',
  'ac-installation': 'AC Installation',
  'ac-replacement': 'AC Replacement',
  'commercial-ac-repair': 'Commercial AC Repair',
  'mini-splits': 'Mini Splits',
  'heat-pump-installation': 'Heat Pump Installation',
  'heat-pump-repair': 'Heat Pump Repair',
  'heat-pump-replacement': 'Heat Pump Replacement',
  'furnace-repair': 'Furnace Repair',
  'furnace-replacement': 'Furnace Replacement',
  'furnace-installation': 'Furnace Installation',
  'heating-repairs': 'Heating Repairs',
};

// ─── Reference file helpers ──────────────────────────────────────────────────

function readReference(pageType) {
  const filePath = path.join(REFERENCE_DIR, `${pageType}.txt`);
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  return null;
}

function saveReference(pageType, content) {
  try {
    if (!fs.existsSync(REFERENCE_DIR)) fs.mkdirSync(REFERENCE_DIR, { recursive: true });
    const lines = ['SOURCE: generated', '='.repeat(60), ''];
    for (const [key, value] of Object.entries(content)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const label = schema.fields.find(f => f.slug === key)?.displayName || key;
      lines.push(`## ${label}`);
      lines.push(value.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim());
      lines.push('');
    }
    fs.writeFileSync(path.join(REFERENCE_DIR, `${pageType}.txt`), lines.join('\n'), 'utf8');
  } catch (err) {
    // File system is read-only in serverless environments — skip silently
    console.warn('saveReference skipped (read-only fs):', err.message);
  }
}

// ─── Content generation ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a content writer for Cold is on the Right Plumbing & Air (CIOTR), a licensed plumbing and HVAC company based in Austin, TX. They serve the greater Austin area.

Company facts:
- Licensed and insured plumbers and HVAC technicians with decades of experience
- Upfront pricing, no hidden fees
- Emergency service available
- Serve Austin and surrounding communities including Bee Cave, Cedar Park, Dripping Springs, Georgetown, Lakeway, Leander, Pflugerville, Round Rock, Spicewood, Steiner Ranch, and Westlake
- Phone: (512) 271-2172
- Brand voice: direct, local, trustworthy, conversational but professional — NOT corporate, NOT generic

Business name rule: The company name is ALWAYS written as "Cold is on the Right Plumbing & Air" — only the words "Cold" and "Right" are capitalized, every other word is lowercase. Never write it as "Cold Is On The Right", "Cold Is On the Right", "cold is on the right", or any other capitalization variation. When shortening the name, always use "Cold is on the Right" (capital C, lowercase i, lowercase o, lowercase t, capital R). This rule is absolute — apply it to every field you generate without exception.

Your job is to write genuinely unique location-specific content. Do NOT just swap city names into Austin copy. Use the location context to write content that actually speaks to what makes that community different — the home ages, property types, local concerns, neighborhood character.

Phone number formatting: whenever (512) 271-2172 appears in any field, it must be a clickable tel: link: <a href="tel:5122712172">(512) 271-2172</a>

Em dash usage: use em dashes (—) sparingly — maximum 1 per entire page, only when no other punctuation works. Do not use them in hero copy, service descriptions, FAQ answers, or bullet lists. Most sentences should use commas, colons, or periods instead.

You must respond with a single valid JSON object and nothing else. Do not include any explanation, commentary, or markdown formatting. Do not wrap the JSON in code blocks. Start your response with { and end with }.`;

function buildPrompt(location, pageType, reference) {
  const serviceName = PAGE_TYPE_NAMES[pageType] || pageType;
  const locationContext = LOCATIONS[location];
  const locationSlug = locationToSlug(location);
  const relatedSlugs = RELATED_PAGES[pageType] || [];
  const relatedLinks = relatedSlugs
    .map(slug => `  /${locationSlug}/${slug}  →  ${PAGE_TYPE_NAMES[slug]}`)
    .join('\n');

  const fieldSpec = `Generate a JSON object with EXACTLY these keys. RichText fields must be valid HTML using only: <h1> <h2> <h3> <p> <ul> <li> <a href="..."> <strong> <em>. PlainText fields must be plain strings with no HTML.

REQUIRED fields (must not be empty):
- "name": "${serviceName} in ${location}, TX"
- "slug": "${pageType}"
- "meta-title": "[Service] in ${location}, TX | Cold is on the Right" (under 60 chars)
- "meta-description": compelling meta description, 145-160 chars, includes ${location} and primary keyword
- "bottom-cta-heading": short punchy CTA headline (plain text, e.g. "Reliable Plumbing in ${location}. Call Today.")
- "hero-copy": <h1>${serviceName} in ${location}, TX</h1> then a location-flavored tagline in <h4> (bold subheading, NOT a <p>), then 2-3 sentence body paragraph in <p>
- "about-section": <h2>About Our [Service] in ${location}</h2> then 2 paragraphs in <p> tags — write for this specific community

ALL other RichText/PlainText fields (generate for all — do not omit any):
- "hero-bullet-1": <p>one short trust bullet</p>
- "hero-bullet-2": <p>one short trust bullet</p>
- "hero-bullet-3": <p>one short trust bullet</p>
- "breadcrumb": plain text breadcrumb label, e.g. "${serviceName}"
- "services-section-heading": <h2>[Service] We Provide in ${location}</h2>
- "service-item-1" through "service-item-11": each is <h3>Service Name</h3><p>2-3 sentence description written for ${location} — be specific about what the service involves and why it matters for this community</p><a href="/LOCATION-SLUG/PAGE-SLUG">Learn More</a>. Generate up to 11 relevant sub-services for ${serviceName}. Every service item that corresponds to one of the available related pages below MUST include a Learn More link using the exact URL listed. Do not invent URLs — only link to pages in the list below.

Available internal links for this page (use these exact URLs):
${relatedLinks || '  (no related pages defined)'}
- "signs-section-heading": <h2>Signs You Need [Service] in ${location}</h2>
- "signs-section-body": <ul> with 5-7 <li> warning signs, specific to the service
- "benefits-section-heading": <h2>Benefits of [Service] in ${location}</h2>
- "benefits-section-body": <ul> with 4-6 <li> benefits
- "unique-section-body": <h2>We Know ${location} Homes</h2> then exactly 2 <p> paragraphs — no more. Written as a genuine narrative (NOT a bullet list). Keep each paragraph to 3-4 sentences maximum. Write it as if a local technician is speaking about their deep familiarity with this specific community. Cover: the types of homes and housing stock common in ${location}, what the age of those homes means for plumbing and HVAC systems (aging pipes, older HVAC units, specific failure patterns), any location-specific factors like well water, lake proximity, Hill Country conditions, new construction quirks, or established neighborhood character, and why that local knowledge makes CIOTR the right call. Each city's version must feel meaningfully different — do not reuse phrases or structure from other cities.
- "process-section-heading": <h2>Our Process</h2>
- "process-step-1": <h3>Step title</h3><p>description</p>
- "process-step-2": <h3>Step title</h3><p>description</p>
- "process-step-3": <h3>Step title</h3><p>description</p>
- "service-area": <h2>Proudly Serving ${location} and Surrounding Areas</h2><p>2-3 sentences mentioning ${location} and nearby communities. Reference specific things about the area where natural.</p>
- "why-choose-us-heading": <h2>Why ${location} Homeowners Choose Us</h2>
- "why-choose-us-intro": <p>2-3 sentences intro, mention ${location} specifically</p>
- "why-choose-us-card-1": <h3>card title</h3><p>1-2 sentences</p>
- "why-choose-us-card-2": <h3>card title</h3><p>1-2 sentences</p>
- "why-choose-us-card-3": <h3>card title</h3><p>1-2 sentences</p>
- "why-choose-us-card-4": <h3>card title</h3><p>1-2 sentences</p>
- "financing-heading": <h2>Financing Options for ${location} Homeowners</h2>
- "financing-body": <p>2-3 sentences about financing</p>
- "faq-1-question" through "faq-6-question": plain text questions (no HTML) — ask questions a real homeowner in ${location} would actually search for
- "faq-1-answer" through "faq-6-answer": plain text answers (no HTML), 3-5 sentences each. Be genuinely informative — include specific details like typical costs, timelines, what to expect during service, warning signs, or how local conditions (hard water, older homes, humidity, well systems etc.) affect the answer. Do not give vague non-answers. Do not include the phone number in FAQ answers.

Do NOT include image fields. Do NOT add extra keys. Output valid JSON only.`;

  let prompt = `Generate a complete CMS page for:
Location: ${location}
Service: ${serviceName}
Location context: ${locationContext}

${fieldSpec}`;

  if (reference) {
    prompt += `

---
REFERENCE (Austin version of this page — use as structural and tonal guide, rewrite for ${location}):

${reference.slice(0, 6000)}`;
  } else {
    prompt += `

No reference file exists for this page type. Generate the content entirely from your knowledge of ${serviceName} services, the CIOTR brand voice, and the ${location} community context above.`;
  }

  return prompt;
}

function extractJson(text) {
  // Try direct parse first
  try { return JSON.parse(text); } catch (_) {}
  // Try stripping markdown code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (_) {} }
  // Try extracting largest { } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  throw new Error('Could not parse JSON from Anthropic response');
}

async function generateContent(location, pageType) {
  const reference = readReference(pageType);
  const prompt = buildPrompt(location, pageType, reference);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  const raw = message.content[0].text;
  const generated = extractJson(raw);

  // Enforce name and slug exactly
  generated['name'] = `${PAGE_TYPE_NAMES[pageType] || pageType} in ${location}, TX`;
  generated['slug'] = pageType;


  return { generated, hasReference: !!reference };
}

// ─── Webflow API ─────────────────────────────────────────────────────────────

function webflowRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.webflow.com',
      path: endpoint,
      method,
      headers: {
        'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Webflow API ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Webflow response parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildFaqSchema(fieldData) {
  const entities = [];
  for (let i = 1; i <= 6; i++) {
    const q = fieldData[`faq-${i}-question`];
    const a = fieldData[`faq-${i}-answer`];
    if (q && a) {
      entities.push({
        '@type': 'Question',
        'name': q,
        'acceptedAnswer': { '@type': 'Answer', 'text': a },
      });
    }
  }
  if (entities.length === 0) return null;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': entities,
  });
  return `<script type="application/ld+json">${json}</script>`;
}

async function pushToWebflow(fieldData, pageType, location, existingItemId = null) {
  const collectionId = getCollectionId(location);

  const IMAGE_FIELD_SLUGS = new Set(['hero-image', 'signs-section-image', 'benefits-section-image', 'unique-section-image']);
  const webflowFields = {};

  for (const field of schema.fields) {
    if (IMAGE_FIELD_SLUGS.has(field.slug)) continue;
    const value = fieldData[field.slug];
    if (value !== undefined && value !== null && value !== '') {
      webflowFields[field.slug] = value;
    }
  }

  // Add image fields: folder-based random selection (with static map as fallback)
  const dynamicImgs = await getImagesForPageType(pageType).catch(() => null);
  const staticImgs  = imageMap[pageType];
  const heroUrl     = dynamicImgs?.hero     || staticImgs?.hero     || null;
  const signsUrl    = dynamicImgs?.signs    || staticImgs?.signs    || null;
  const beneUrl     = dynamicImgs?.benefits || staticImgs?.benefits || null;
  const pageName    = fieldData['name'] || '';
  if (heroUrl)  webflowFields['hero-image']             = { url: heroUrl,  alt: pageName };
  if (signsUrl) webflowFields['signs-section-image']    = { url: signsUrl, alt: `Signs you need ${pageName}` };
  if (beneUrl)  webflowFields['benefits-section-image'] = { url: beneUrl,  alt: `Benefits of ${pageName}` };

  // City expertise image (unique-section-image) from city image map
  const cityImg = cityImageMap[fieldData['_location']];
  if (cityImg) {
    webflowFields['unique-section-image'] = { url: cityImg, alt: `${fieldData['_location']} homes` };
  }

  // FAQ JSON-LD schema — built server-side from Q&A fields
  const faqSchema = buildFaqSchema(fieldData);
  if (faqSchema) webflowFields['faq-schema'] = faqSchema;

  // If we already know the existing item ID, go straight to PATCH
  if (existingItemId) {
    const result = await webflowRequest('PATCH', `/v2/collections/${collectionId}/items/${existingItemId}`, { fieldData: webflowFields, isDraft: true });
    return { ...result, wasUpdate: true };
  }

  // Try POST first; if slug already exists, look up the item and retry with PATCH
  try {
    const result = await webflowRequest('POST', `/v2/collections/${collectionId}/items`, { fieldData: webflowFields, isDraft: true });
    return { ...result, wasUpdate: false };
  } catch (postErr) {
    const isSlugConflict = postErr.message && postErr.message.includes('Unique value is already in database');
    if (!isSlugConflict) throw postErr;

    // Slug conflict — fetch all items to find the existing ID and PATCH it
    const existingMap = await getExistingItems(location);
    const conflictId = existingMap[pageType];
    if (!conflictId) throw new Error(`Webflow slug conflict: "${pageType}" is already used in another location's collection on this site. This is a Webflow platform limitation — you can still generate and preview the content here, but you'll need to create this page manually in the Webflow Designer (it will get an auto-generated URL like /${locationToSlug(location)}/${pageType}-xxxxx). Once that placeholder exists, push from here will update it automatically.`);

    const result = await webflowRequest('PATCH', `/v2/collections/${collectionId}/items/${conflictId}`, { fieldData: webflowFields, isDraft: true });
    return { ...result, wasUpdate: true };
  }
}

// ─── Webflow existing items ──────────────────────────────────────────────────

async function getExistingItems(location) {
  const collectionId = getCollectionId(location);
  if (!collectionId) return {};
  try {
    const result = await webflowRequest('GET', `/v2/collections/${collectionId}/items?limit=100`);
    const map = {};
    for (const item of (result.items || [])) {
      const slug = item.fieldData?.slug;
      if (slug) map[slug] = item.id;
    }
    return map;
  } catch (err) {
    console.error(`[getExistingItems] FAILED for location="${location}" collectionId="${collectionId}":`, err.message);
    return {};
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  res.json({
    locations: Object.keys(LOCATIONS),
    pageTypes: Object.keys(PAGE_TYPE_NAMES).map(slug => ({
      slug,
      name: PAGE_TYPE_NAMES[slug],
      hasReference: fs.existsSync(path.join(REFERENCE_DIR, `${slug}.txt`)),
    })),
  });
});

app.get('/api/image-debug', async (req, res) => {
  try {
    const siteId = process.env.WEBFLOW_SITE_ID;
    const raw = await webflowRequest('GET', `/v2/sites/${siteId}/assets?limit=5&offset=0`);
    const assets = raw.assets || [];
    // Show every key on the first asset so we can see exactly what fields Webflow returns
    const firstAsset = assets[0] ? Object.keys(assets[0]) : [];
    const sample = assets.map(a => ({
      id: a.id,
      name: a.displayName || a.name,
      parentFolder: a.parentFolder,
      assetFolderId: a.assetFolderId,
      assetParentFolderInfo: a.assetParentFolderInfo,
      hostedUrl: (a.hostedUrl || a.url || '').slice(0, 80),
    }));
    res.json({ total: raw.total, assetKeys: firstAsset, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/existing-slugs', async (req, res) => {
  const items = await getExistingItems(req.query.location);
  res.json({ slugs: Object.keys(items), items });
});

app.post('/api/generate', async (req, res) => {
  const { location, pageType } = req.body;

  if (!location || !pageType) {
    return res.status(400).json({ error: 'location and pageType are required' });
  }
  if (!LOCATIONS[location]) {
    return res.status(400).json({ error: `Unknown location: ${location}` });
  }
  if (!PAGE_TYPE_NAMES[pageType]) {
    return res.status(400).json({ error: `Unknown page type: ${pageType}` });
  }

  try {
    const { generated, hasReference } = await generateContent(location, pageType);

    // Build FAQ schema now so it appears in preview and is ready for push
    const faqSchema = buildFaqSchema(generated);
    if (faqSchema) generated['faq-schema'] = faqSchema;

    const dynamicImgs = await getImagesForPageType(pageType).catch(() => null);
    const staticImgs  = imageMap[pageType] || {};
    const images = {
      hero:     dynamicImgs?.hero     || staticImgs.hero     || null,
      signs:    dynamicImgs?.signs    || staticImgs.signs    || null,
      benefits: dynamicImgs?.benefits || staticImgs.benefits || null,
    };
    const cityImage = cityImageMap[location] || null;
    res.json({ success: true, content: generated, hasReference, images, cityImage });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push', async (req, res) => {
  const { content, pageType, location, saveReference: shouldSaveReference } = req.body;

  if (!content || !pageType) {
    return res.status(400).json({ error: 'content and pageType are required' });
  }

  // Attach location so pushToWebflow can look up the city image
  if (location) content['_location'] = location;

  try {
    // Check if this slug already exists so we can update instead of create
    const existingItems = await getExistingItems(location);
    const existingItemId = existingItems[pageType] || null;

    const result = await pushToWebflow(content, pageType, location, existingItemId);

    // Save as reference file if this page type had no reference
    if (shouldSaveReference) {
      saveReference(pageType, content);
    }

    const siteId = process.env.WEBFLOW_SITE_ID;
    const collectionId = getCollectionId(location);
    const dashboardUrl = `https://webflow.com/dashboard/sites/${siteId}/cms/${collectionId}`;

    res.json({
      success: true,
      itemId: result.id,
      wasUpdate: result.wasUpdate || false,
      dashboardUrl,
    });
  } catch (err) {
    console.error('Webflow push error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

// Export for Vercel serverless — also listen when run directly (local dev)
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\nCIOTR CMS Automation running at http://localhost:${PORT}\n`);
  });
}
