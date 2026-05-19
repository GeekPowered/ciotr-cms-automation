require('dotenv').config();
const express = require('express');
const session = require('express-session');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ciotr-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

const APP_PASSWORD = process.env.APP_PASSWORD || 'GameChanger45!';

app.get('/login', (req, res) => {
  if (req.session.authed) return res.redirect('/');
  const error = req.query.error ? '<p style="color:#f87171;margin:0 0 16px">Incorrect password.</p>' : '';
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CIOTR CMS — Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f1117;color:#f0f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#181c27;border:1px solid #2d3348;border-radius:16px;padding:40px;width:100%;max-width:380px;box-shadow:0 24px 64px rgba(0,0,0,.6)}.logo{font-size:32px;margin-bottom:16px}.title{font-size:20px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:#6b7599;margin-bottom:28px}input{width:100%;height:44px;background:#1e2233;border:1px solid #374060;border-radius:8px;padding:0 14px;color:#f0f2f8;font-size:14px;margin-bottom:16px;outline:none}input:focus{border-color:#4f8ef7;box-shadow:0 0 0 3px rgba(79,142,247,.15)}button{width:100%;height:44px;background:#4f8ef7;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}button:hover{background:#6ba3fa}</style></head><body><div class="card"><div class="logo">❄️</div><div class="title">CIOTR CMS Automation</div><div class="sub">Cold Is On the Right · Location Page Generator</div>${error}<form method="POST" action="/login"><input type="password" name="password" placeholder="Password" autofocus><button type="submit">Sign In</button></form></div></body></html>`);
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
  req.session.destroy(() => res.redirect('/login'));
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
  'Cedar Park': process.env.WEBFLOW_COLLECTION_ID_CEDAR_PARK,
  'Round Rock': process.env.WEBFLOW_COLLECTION_ID_ROUND_ROCK,
};

function getCollectionId(location) {
  return COLLECTION_IDS[location] || process.env.WEBFLOW_COLLECTION_ID;
}
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'webflow-schema.json'), 'utf8'));
const REFERENCE_DIR = path.join(__dirname, 'reference-pages');

const IMAGE_MAP_PATH = path.join(__dirname, 'image-map.json');
const imageMap = fs.existsSync(IMAGE_MAP_PATH)
  ? JSON.parse(fs.readFileSync(IMAGE_MAP_PATH, 'utf8'))
  : {};

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
}

// ─── Content generation ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a content writer for Cold Is On the Right Plumbing & Air (CIOTR), a licensed plumbing and HVAC company based in Austin, TX. They serve the greater Austin area.

Company facts:
- Licensed and insured plumbers and HVAC technicians with decades of experience
- Upfront pricing, no hidden fees
- Emergency service available
- Serve Austin and surrounding communities including Bee Cave, Cedar Park, Dripping Springs, Georgetown, Lakeway, Leander, Pflugerville, Round Rock, Spicewood, Steiner Ranch, and Westlake
- Phone: (512) 271-2172
- Brand voice: direct, local, trustworthy, conversational but professional — NOT corporate, NOT generic

Your job is to write genuinely unique location-specific content. Do NOT just swap city names into Austin copy. Use the location context to write content that actually speaks to what makes that community different — the home ages, property types, local concerns, neighborhood character.

Phone number formatting: whenever (512) 271-2172 appears in any field, it must be a clickable tel: link: <a href="tel:5122712172">(512) 271-2172</a>

Em dash usage: use em dashes (—) sparingly — maximum 1 per entire page, only when no other punctuation works. Do not use them in hero copy, service descriptions, FAQ answers, or bullet lists. Most sentences should use commas, colons, or periods instead.

You must respond with a single valid JSON object and nothing else. Do not include any explanation, commentary, or markdown formatting. Do not wrap the JSON in code blocks. Start your response with { and end with }.`;

function buildPrompt(location, pageType, reference) {
  const serviceName = PAGE_TYPE_NAMES[pageType] || pageType;
  const locationContext = LOCATIONS[location];

  const fieldSpec = `Generate a JSON object with EXACTLY these keys. RichText fields must be valid HTML using only: <h1> <h2> <h3> <p> <ul> <li> <a href="..."> <strong> <em>. PlainText fields must be plain strings with no HTML.

REQUIRED fields (must not be empty):
- "name": "${serviceName} in ${location}, TX"
- "slug": "${pageType}"
- "meta-title": "[Service] in ${location}, TX | Cold Is On the Right" (under 60 chars)
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
- "service-item-1" through "service-item-11": each is <h3>Service Name</h3><p>2-3 sentence description written for ${location} — be specific about what the service involves and why it matters for this community</p> and optionally <a href="/path">Learn More</a> where a link exists. Generate up to 11 relevant sub-services for ${serviceName}. Use the reference links where provided.
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

async function pushToWebflow(fieldData, pageType, location) {
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

  // Add image fields from image map
  const imgs = imageMap[pageType];
  if (imgs) {
    if (imgs.hero)     webflowFields['hero-image']             = { url: imgs.hero,     alt: fieldData['name'] || '' };
    if (imgs.signs)    webflowFields['signs-section-image']    = { url: imgs.signs,    alt: `Signs you need ${fieldData['name'] || ''}` };
    if (imgs.benefits) webflowFields['benefits-section-image'] = { url: imgs.benefits, alt: `Benefits of ${fieldData['name'] || ''}` };
  }

  // City expertise image (unique-section-image) from city image map
  const cityImg = cityImageMap[fieldData['_location']];
  if (cityImg) {
    webflowFields['unique-section-image'] = { url: cityImg, alt: `${fieldData['_location']} homes` };
  }

  const result = await webflowRequest(
    'POST',
    `/v2/collections/${collectionId}/items`,
    { fieldData: webflowFields, isDraft: true }
  );

  return result;
}

// ─── Webflow existing items ──────────────────────────────────────────────────

async function getExistingSlugs(location) {
  const collectionId = getCollectionId(location);
  if (!collectionId) return [];
  try {
    const result = await webflowRequest('GET', `/v2/collections/${collectionId}/items?limit=100`);
    return (result.items || []).map(item => item.fieldData?.slug).filter(Boolean);
  } catch (err) {
    console.error('Could not fetch existing CMS items:', err.message);
    return [];
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

app.get('/api/existing-slugs', async (req, res) => {
  const slugs = await getExistingSlugs(req.query.location);
  res.json({ slugs });
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
    const images = imageMap[pageType] || { hero: null, signs: null, benefits: null };
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
    const result = await pushToWebflow(content, pageType, location);

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
      dashboardUrl,
    });
  } catch (err) {
    console.error('Webflow push error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nCIOTR CMS Automation running at http://localhost:${PORT}\n`);
});
