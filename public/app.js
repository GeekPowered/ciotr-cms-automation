/* ── Field section definitions ────────────────────────────── */
const FIELD_SECTIONS = [
  {
    label: 'SEO & Identity',
    fields: ['name', 'slug', 'meta-title', 'meta-description', 'breadcrumb'],
  },
  {
    label: 'Hero',
    fields: ['hero-image', 'hero-copy', 'hero-bullet-1', 'hero-bullet-2', 'hero-bullet-3'],
  },
  {
    label: 'About Section',
    fields: ['about-section'],
  },
  {
    label: 'Services',
    fields: [
      'services-section-heading',
      'service-item-1', 'service-item-2', 'service-item-3', 'service-item-4',
      'service-item-5', 'service-item-6', 'service-item-7', 'service-item-8',
      'service-item-9', 'service-item-10', 'service-item-11',
    ],
  },
  {
    label: 'Signs Section',
    fields: ['signs-section-image', 'signs-section-heading', 'signs-section-body'],
  },
  {
    label: 'Benefits Section',
    fields: ['benefits-section-image', 'benefits-section-heading', 'benefits-section-body'],
  },
  {
    label: 'City Expertise',
    fields: ['unique-section-image', 'unique-section-body'],
  },
  {
    label: 'Our Process',
    fields: ['process-section-heading', 'process-step-1', 'process-step-2', 'process-step-3'],
  },
  {
    label: 'Service Area',
    fields: ['service-area'],
  },
  {
    label: 'Why Choose Us',
    fields: [
      'why-choose-us-heading', 'why-choose-us-intro',
      'why-choose-us-card-1', 'why-choose-us-card-2',
      'why-choose-us-card-3', 'why-choose-us-card-4',
    ],
  },
  {
    label: 'Financing',
    fields: ['financing-heading', 'financing-body'],
  },
  {
    label: 'FAQs',
    fields: [
      'faq-1-question', 'faq-1-answer',
      'faq-2-question', 'faq-2-answer',
      'faq-3-question', 'faq-3-answer',
      'faq-4-question', 'faq-4-answer',
      'faq-5-question', 'faq-5-answer',
      'faq-6-question', 'faq-6-answer',
      'faq-schema',
    ],
  },
  {
    label: 'Bottom CTA',
    fields: ['bottom-cta-heading'],
  },
];

// Field display metadata (type + label, derived from schema on load)
let fieldMeta = {};

// Current state
let currentContent = null;
let currentImages = null;
let currentLocation = null;
let currentPageType = null;
let currentHasReference = true;
let existingSlugs = new Set();

// Batch state
let batchPages = [];
let batchLocation = null;
let batchSelectedIndex = -1;

// Timing
let currentElapsed = null;
let singleTimerInterval = null;
let batchTimerInterval = null;

/* ── Boot ─────────────────────────────────────────────────── */
async function boot() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();

    // Populate location dropdown
    const locSel = document.getElementById('location-select');
    config.locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      locSel.appendChild(opt);
    });

    // Populate page type dropdown
    const ptSel = document.getElementById('pagetype-select');
    config.pageTypes.forEach(pt => {
      const opt = document.createElement('option');
      opt.value = pt.slug;
      opt.textContent = pt.name + (pt.hasReference ? '' : ' ✦');
      if (!pt.hasReference) opt.classList.add('no-reference');
      ptSel.appendChild(opt);
    });

    // Build field meta from schema embedded in config (we load it separately)
    await loadFieldMeta();

    wireEvents();
    loadExistingSlugs(null); // non-blocking — updates dropdown when ready
    restoreSession();
    markSavedDropdownOptions();
  } catch (err) {
    showError('Failed to load app config: ' + err.message);
  }
}

async function loadExistingSlugs(location) {
  try {
    const url = location ? `/api/existing-slugs?location=${encodeURIComponent(location)}` : '/api/existing-slugs';
    const res = await fetch(url);
    const data = await res.json();
    existingSlugs = new Set(data.slugs || []);

    const ptSel = document.getElementById('pagetype-select');
    for (const opt of ptSel.options) {
      if (!opt.value) continue;
      // Reset exists-in-cms state before re-applying
      opt.classList.remove('exists-in-cms');
      opt.textContent = opt.textContent.replace(/^✓\s*/, '');
      if (existingSlugs.has(opt.value)) {
        opt.textContent = '✓ ' + opt.textContent;
        opt.classList.add('exists-in-cms');
      }
    }
  } catch (_) {
    // Non-critical — silently ignore if Webflow API is unreachable
  }
}

async function loadFieldMeta() {
  // We derive field types from the schema by fetching it
  // The server exposes nothing about schema types directly, so we hard-code the type map
  // based on the webflow-schema.json we already know
  const RICH_TEXT_FIELDS = new Set([
    'hero-copy','hero-bullet-1','hero-bullet-2','hero-bullet-3',
    'about-section','services-section-heading',
    'service-item-1','service-item-2','service-item-3','service-item-4',
    'service-item-5','service-item-6','service-item-7','service-item-8',
    'service-item-9','service-item-10','service-item-11',
    'signs-section-heading','signs-section-body',
    'benefits-section-heading','benefits-section-body',
    'unique-section-body',
    'process-section-heading','process-step-1','process-step-2','process-step-3',
    'service-area',
    'why-choose-us-heading','why-choose-us-intro',
    'why-choose-us-card-1','why-choose-us-card-2','why-choose-us-card-3','why-choose-us-card-4',
    'financing-heading','financing-body',
  ]);

  const DISPLAY_NAMES = {
    'name': 'Name', 'slug': 'Slug', 'breadcrumb': 'Breadcrumb',
    'meta-title': 'Meta Title', 'meta-description': 'Meta Description',
    'hero-copy': 'Hero Copy', 'hero-bullet-1': 'Hero Bullet 1',
    'hero-bullet-2': 'Hero Bullet 2', 'hero-bullet-3': 'Hero Bullet 3',
    'about-section': 'About Section',
    'services-section-heading': 'Services Section Heading',
    'service-item-1': 'Service Item 1', 'service-item-2': 'Service Item 2',
    'service-item-3': 'Service Item 3', 'service-item-4': 'Service Item 4',
    'service-item-5': 'Service Item 5', 'service-item-6': 'Service Item 6',
    'service-item-7': 'Service Item 7', 'service-item-8': 'Service Item 8',
    'service-item-9': 'Service Item 9', 'service-item-10': 'Service Item 10',
    'service-item-11': 'Service Item 11',
    'signs-section-heading': 'Signs Heading', 'signs-section-body': 'Signs Body',
    'benefits-section-heading': 'Benefits Heading', 'benefits-section-body': 'Benefits Body',
    'unique-section-body': 'City Expertise Body',
    'process-section-heading': 'Process Heading',
    'process-step-1': 'Process Step 1', 'process-step-2': 'Process Step 2',
    'process-step-3': 'Process Step 3',
    'service-area': 'Service Area',
    'why-choose-us-heading': 'Why Choose Us Heading',
    'why-choose-us-intro': 'Why Choose Us Intro',
    'why-choose-us-card-1': 'Why Choose Us Card 1', 'why-choose-us-card-2': 'Why Choose Us Card 2',
    'why-choose-us-card-3': 'Why Choose Us Card 3', 'why-choose-us-card-4': 'Why Choose Us Card 4',
    'financing-heading': 'Financing Heading', 'financing-body': 'Financing Body',
    'faq-1-question': 'FAQ 1 Question', 'faq-1-answer': 'FAQ 1 Answer',
    'faq-2-question': 'FAQ 2 Question', 'faq-2-answer': 'FAQ 2 Answer',
    'faq-3-question': 'FAQ 3 Question', 'faq-3-answer': 'FAQ 3 Answer',
    'faq-4-question': 'FAQ 4 Question', 'faq-4-answer': 'FAQ 4 Answer',
    'faq-5-question': 'FAQ 5 Question', 'faq-5-answer': 'FAQ 5 Answer',
    'faq-6-question': 'FAQ 6 Question', 'faq-6-answer': 'FAQ 6 Answer',
    'faq-schema': 'FAQ Schema (JSON-LD)',
    'bottom-cta-heading': 'Bottom CTA Heading',
    'hero-image': 'Hero Image',
    'signs-section-image': 'Signs Section Image',
    'benefits-section-image': 'Benefits Section Image',
    'unique-section-image': 'Unique Section Image',
  };

  for (const [slug, name] of Object.entries(DISPLAY_NAMES)) {
    const isImage = slug.endsWith('-image');
    fieldMeta[slug] = {
      displayName: name,
      type: isImage ? 'Image' : RICH_TEXT_FIELDS.has(slug) ? 'RichText' : 'PlainText',
    };
  }
}

/* ── Event wiring ─────────────────────────────────────────── */
function wireEvents() {
  const locSel = document.getElementById('location-select');
  const ptSel = document.getElementById('pagetype-select');
  const genBtn = document.getElementById('generate-btn');
  const batchBtn = document.getElementById('batch-btn');

  function updateButtons() {
    genBtn.disabled = !locSel.value || !ptSel.value;
    batchBtn.disabled = !locSel.value;
  }

  locSel.addEventListener('change', () => {
    updateButtons();
    loadExistingSlugs(locSel.value);
  });
  ptSel.addEventListener('change', updateButtons);

  genBtn.addEventListener('click', () => {
    currentLocation = locSel.value;
    currentPageType = ptSel.value;
    runGenerate();
  });

  batchBtn.addEventListener('click', () => runBatchGenerate());

  document.getElementById('regenerate-btn').addEventListener('click', runGenerate);

  document.getElementById('push-btn').addEventListener('click', showPushModal);
  document.getElementById('modal-cancel').addEventListener('click', hidePushModal);
  document.getElementById('modal-confirm').addEventListener('click', runPush);

  document.getElementById('generate-another-btn').addEventListener('click', () => {
    showState('empty');
    currentContent = null;
  });

  document.getElementById('batch-push-all-btn').addEventListener('click', runBatchPushAll);

  // Close modal on overlay click
  document.getElementById('push-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hidePushModal();
  });
}

/* ── State helpers ────────────────────────────────────────── */
function showState(state) {
  ['empty-state', 'loading-state', 'preview-panel', 'success-state', 'batch-panel'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  if (state === 'empty')   document.getElementById('empty-state').classList.remove('hidden');
  else if (state === 'loading')  document.getElementById('loading-state').classList.remove('hidden');
  else if (state === 'preview')  document.getElementById('preview-panel').classList.remove('hidden');
  else if (state === 'success')  document.getElementById('success-state').classList.remove('hidden');
  else if (state === 'batch')    document.getElementById('batch-panel').classList.remove('hidden');
}

function showError(msg) {
  // Display error inline in loading area
  const loadingSub = document.getElementById('loading-sub');
  const loadingTitle = document.querySelector('.loading-title');
  if (loadingTitle) loadingTitle.textContent = 'Something went wrong';
  if (loadingSub) {
    loadingSub.textContent = msg;
    loadingSub.style.color = 'var(--red)';
  }
}

/* ── Generate ─────────────────────────────────────────────── */
async function runGenerate() {
  showState('loading');
  document.getElementById('loading-sub').textContent = 'Calling Claude API — this takes about 20-30 seconds…';
  document.getElementById('loading-sub').style.color = '';
  document.querySelector('.loading-title').textContent = 'Generating content…';

  const startTime = Date.now();
  clearInterval(singleTimerInterval);
  singleTimerInterval = setInterval(() => {
    const secs = ((Date.now() - startTime) / 1000).toFixed(0);
    document.getElementById('loading-sub').textContent = `Generating… ${secs}s`;
  }, 1000);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: currentLocation, pageType: currentPageType }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errMsg = data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : 'Generation failed';
      throw new Error(errMsg);
    }

    clearInterval(singleTimerInterval);
    currentElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    currentContent = data.content;
    currentHasReference = data.hasReference;
    currentImages = data.images || {};

    // Inject image URLs into content so renderPreview can display them
    if (currentImages.hero)     currentContent['hero-image']             = currentImages.hero;
    if (currentImages.signs)    currentContent['signs-section-image']    = currentImages.signs;
    if (currentImages.benefits) currentContent['benefits-section-image'] = currentImages.benefits;
    if (data.cityImage)         currentContent['unique-section-image']   = data.cityImage;

    saveSession();
    renderPreview();
    showState('preview');
  } catch (err) {
    clearInterval(singleTimerInterval);
    showState('loading'); // keep loading panel visible to show error
    showError(err.message);
  }
}

/* ── Preview rendering ────────────────────────────────────── */
function renderFieldSections(container, content) {
  container.innerHTML = '';
  FIELD_SECTIONS.forEach((section, idx) => {
    const populated = section.fields.filter(slug => {
      const val = content[slug];
      return val !== undefined && val !== null && String(val).trim() !== '';
    });
    if (populated.length === 0) return;

    const group = document.createElement('div');
    group.className = 'section-group' + (idx < 3 ? ' open' : '');

    const heading = document.createElement('div');
    heading.className = 'section-heading';
    heading.innerHTML = `<span>${section.label}</span><span class="section-chevron">▼</span>`;
    heading.addEventListener('click', () => group.classList.toggle('open'));

    const body = document.createElement('div');
    body.className = 'section-body';

    populated.forEach(slug => {
      const meta = fieldMeta[slug] || { displayName: slug, type: 'PlainText' };
      body.appendChild(buildFieldRow(slug, meta, content[slug], content));
    });

    group.appendChild(heading);
    group.appendChild(body);
    container.appendChild(group);
  });
}

function renderPreview() {
  const existingWarning = document.getElementById('existing-warning');
  existingWarning.classList.toggle('hidden', !existingSlugs.has(currentPageType));

  const name = currentContent['name'] || `${currentPageType} — ${currentLocation}`;
  document.getElementById('preview-title').textContent = name;

  const badge = document.getElementById('preview-badge');
  if (currentHasReference) {
    badge.textContent = 'Reference used';
    badge.className = 'preview-badge preview-badge--reference';
  } else {
    badge.textContent = 'Generated from scratch ✦';
    badge.className = 'preview-badge preview-badge--generated';
  }

  const elapsed = document.getElementById('preview-elapsed');
  if (elapsed) elapsed.textContent = currentElapsed ? `⏱ ${currentElapsed}s` : '';

  renderFieldSections(document.getElementById('field-sections'), currentContent);
}

function buildFieldRow(slug, meta, value, contentRef) {
  const row = document.createElement('div');
  row.className = 'field-row';

  // Label column
  const label = document.createElement('div');
  label.className = 'field-label';
  label.innerHTML = `
    <span class="field-label-name">${meta.displayName}</span>
    <span class="field-label-slug">${slug}</span>
    <span class="field-label-type">
      <span class="field-type-badge ${meta.type === 'RichText' ? 'badge-rich' : meta.type === 'Image' ? 'badge-image' : 'badge-plain'}">
        ${meta.type}
      </span>
    </span>`;

  // Value column
  const valueEl = document.createElement('div');
  if (!value || String(value).trim() === '') {
    valueEl.className = 'field-value field-value--empty';
    valueEl.textContent = '(empty)';
  } else if (meta.type === 'Image') {
    valueEl.className = 'field-value field-value--image';

    const img = document.createElement('img');
    img.src = value;
    img.alt = meta.displayName;
    img.className = 'field-image-preview';

    const urlRow = document.createElement('div');
    urlRow.className = 'field-image-url-row';

    const urlText = document.createElement('span');
    urlText.className = 'field-image-url';
    urlText.textContent = value.split('/').pop();

    const swapBtn = document.createElement('button');
    swapBtn.className = 'btn-swap';
    swapBtn.textContent = '↺ Swap';

    urlRow.appendChild(urlText);
    urlRow.appendChild(swapBtn);

    const swapForm = document.createElement('div');
    swapForm.className = 'swap-form hidden';
    swapForm.innerHTML = `
      <input class="swap-input" type="text" placeholder="Paste new image URL…" value="${value}" />
      <button class="swap-apply btn btn--primary" style="height:32px;padding:0 12px;font-size:12px;">Apply</button>
      <button class="swap-cancel btn btn--secondary" style="height:32px;padding:0 12px;font-size:12px;">Cancel</button>`;

    swapBtn.addEventListener('click', () => {
      swapForm.classList.remove('hidden');
      swapForm.querySelector('.swap-input').select();
    });

    swapForm.querySelector('.swap-cancel').addEventListener('click', () => {
      swapForm.classList.add('hidden');
    });

    swapForm.querySelector('.swap-apply').addEventListener('click', () => {
      const newUrl = swapForm.querySelector('.swap-input').value.trim();
      if (!newUrl) return;
      img.src = newUrl;
      urlText.textContent = newUrl.split('/').pop();
      swapForm.querySelector('.swap-input').value = newUrl;
      swapForm.classList.add('hidden');
      // Update the content object so the new URL is used on push
      if (contentRef) contentRef[slug] = newUrl;
    });

    valueEl.appendChild(img);
    valueEl.appendChild(urlRow);
    valueEl.appendChild(swapForm);
  } else if (meta.type === 'RichText') {
    valueEl.className = 'field-value';
    valueEl.innerHTML = value;
  } else {
    valueEl.className = 'field-value field-value--plain';
    valueEl.textContent = value;
  }

  row.appendChild(label);
  row.appendChild(valueEl);
  return row;
}

/* ── Push modal ───────────────────────────────────────────── */
function showPushModal() {
  const name = currentContent['name'] || currentPageType;
  document.getElementById('modal-body').textContent =
    `"${name}" will be created as a draft in your Webflow CMS collection. It will not be published automatically.`;
  document.getElementById('push-modal').classList.remove('hidden');
}

function hidePushModal() {
  document.getElementById('push-modal').classList.add('hidden');
}

/* ── Push to Webflow ──────────────────────────────────────── */
async function runPush() {
  hidePushModal();

  const pushBtn = document.getElementById('push-btn');
  pushBtn.disabled = true;
  pushBtn.textContent = 'Pushing…';

  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: currentContent,
        pageType: currentPageType,
        location: currentLocation,
        saveReference: !currentHasReference,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Push failed');
    }

    // Mark as existing so the dropdown updates immediately
    existingSlugs.add(currentPageType);
    const ptSel = document.getElementById('pagetype-select');
    for (const opt of ptSel.options) {
      if (opt.value === currentPageType && !opt.textContent.startsWith('✓')) {
        opt.textContent = '✓ ' + opt.textContent;
        opt.classList.add('exists-in-cms');
        break;
      }
    }

    // Show success
    const name = currentContent['name'] || currentPageType;
    const action = data.wasUpdate ? 'updated' : 'created';
    document.getElementById('success-sub').textContent =
      `"${name}" has been ${action} as a draft (ID: ${data.itemId}).` +
      (!currentHasReference && !data.wasUpdate ? ' Reference file saved for future generations.' : '');

    const webflowLink = document.getElementById('webflow-link');
    webflowLink.href = data.dashboardUrl;

    showState('success');
  } catch (err) {
    pushBtn.disabled = false;
    pushBtn.textContent = '✓ Approve & Push to Webflow';
    alert('Push failed: ' + err.message);
  }
}

/* ── Batch generation ─────────────────────────────────────── */
async function runBatchGenerate() {
  const locSel = document.getElementById('location-select');
  batchLocation = locSel.value;
  if (!batchLocation) return;

  const ptSel = document.getElementById('pagetype-select');
  batchPages = Array.from(ptSel.options)
    .filter(opt => opt.value)
    .map(opt => ({
      slug: opt.value,
      name: opt.textContent.replace(/^[✓✦\s]+/, '').trim(),
      status: 'pending',
      content: null,
      images: null,
      cityImage: null,
      hasReference: true,
      error: null,
      elapsed: null,
    }));

  batchSelectedIndex = -1;
  showState('batch');
  document.getElementById('batch-title').textContent = `Generating all pages — ${batchLocation}`;
  document.getElementById('batch-push-all-btn').classList.add('hidden');
  updateBatchProgress(0, batchPages.length);
  renderBatchSidebar();
  const batchStartTime = Date.now();

  clearInterval(batchTimerInterval);
  batchTimerInterval = setInterval(() => {
    batchPages.forEach((page, idx) => {
      if (page.status !== 'generating' || !page.startTime) return;
      const secs = ((Date.now() - page.startTime) / 1000).toFixed(0);
      const el = document.querySelector(`.batch-sidebar-item[data-index="${idx}"] .batch-sidebar-elapsed`);
      if (el) el.textContent = ` · ${secs}s`;
    });
  }, 1000);

  const total = batchPages.length;
  let completed = 0;
  let nextIndex = 0;
  const CONCURRENCY = 3;

  async function worker() {
    while (nextIndex < total) {
      const i = nextIndex++;
      batchPages[i].status = 'generating';
      const pageStart = Date.now();
      batchPages[i].startTime = pageStart;
      updateBatchSidebarItem(i);
      if (batchSelectedIndex === i) renderBatchContent(i);

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: batchLocation, pageType: batchPages[i].slug }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          const errMsg = data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : 'Generation failed';
          throw new Error(errMsg);
        }

        batchPages[i].content = data.content;
        batchPages[i].images = data.images || {};
        batchPages[i].cityImage = data.cityImage;
        batchPages[i].hasReference = data.hasReference;

        const imgs = batchPages[i].images;
        if (imgs.hero)      batchPages[i].content['hero-image']             = imgs.hero;
        if (imgs.signs)     batchPages[i].content['signs-section-image']    = imgs.signs;
        if (imgs.benefits)  batchPages[i].content['benefits-section-image'] = imgs.benefits;
        if (data.cityImage) batchPages[i].content['unique-section-image']   = data.cityImage;

        batchPages[i].status = 'done';
      } catch (err) {
        batchPages[i].status = 'error';
        batchPages[i].error = err.message;
      }

      batchPages[i].elapsed = ((Date.now() - pageStart) / 1000).toFixed(1);
      completed++;
      updateBatchProgress(completed, total);
      saveBatchSession();
      updateBatchSidebarItem(i);

      // Auto-select first finished page
      if (batchSelectedIndex === -1 && batchPages[i].status === 'done') {
        batchSelectedIndex = i;
      }
      if (batchSelectedIndex === i) renderBatchContent(i);
    }
  }

  // Show first item as generating while we kick off workers
  batchSelectedIndex = 0;
  renderBatchContent(0);

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  clearInterval(batchTimerInterval);
  const doneCount = batchPages.filter(p => p.status === 'done').length;
  const errorCount = batchPages.filter(p => p.status === 'error').length;
  const totalElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(0);
  document.getElementById('batch-title').textContent =
    `${doneCount} of ${total} pages ready — ${batchLocation} · ⏱ ${totalElapsed}s total` +
    (errorCount > 0 ? ` (${errorCount} failed)` : '');

  if (doneCount > 0) {
    document.getElementById('batch-push-all-btn').classList.remove('hidden');
  }

  // Re-render selected page in case it changed
  if (batchSelectedIndex >= 0) renderBatchContent(batchSelectedIndex);
}

function updateBatchProgress(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('batch-progress-fill').style.width = pct + '%';
  document.getElementById('batch-progress-text').textContent = `${completed} / ${total}`;
}

function renderBatchSidebar() {
  const sidebar = document.getElementById('batch-sidebar');
  sidebar.innerHTML = '';
  batchPages.forEach((_, i) => sidebar.appendChild(buildBatchSidebarItem(i)));
}

function buildBatchSidebarItem(i) {
  const page = batchPages[i];
  const icons = { pending: '○', generating: '◌', done: '●', error: '✗', pushed: '✓' };
  const item = document.createElement('div');
  item.className = 'batch-sidebar-item' + (i === batchSelectedIndex ? ' active' : '');
  item.innerHTML = `
    <span class="batch-status batch-status--${page.status}">${icons[page.status] || '○'}</span>
    <span class="batch-sidebar-name">${page.name}${page.elapsed ? `<span class="batch-sidebar-elapsed"> · ${page.elapsed}s</span>` : ''}</span>`;
  item.addEventListener('click', () => {
    batchSelectedIndex = i;
    document.querySelectorAll('.batch-sidebar-item').forEach((el, j) =>
      el.classList.toggle('active', j === i));
    renderBatchContent(i);
  });
  return item;
}

function updateBatchSidebarItem(i) {
  const sidebar = document.getElementById('batch-sidebar');
  if (sidebar.children[i]) {
    sidebar.replaceChild(buildBatchSidebarItem(i), sidebar.children[i]);
  }
}

function renderBatchContent(i) {
  const page = batchPages[i];
  const batchContent = document.getElementById('batch-content');

  if (page.status === 'pending' || page.status === 'generating') {
    const msg = page.status === 'generating' ? 'Generating…' : 'Waiting to generate';
    batchContent.innerHTML = `
      <div class="batch-placeholder">
        <div class="empty-icon">${page.status === 'generating' ? '◌' : '○'}</div>
        <div class="empty-title">${msg}</div>
      </div>`;
    return;
  }

  if (page.status === 'error') {
    batchContent.innerHTML = `
      <div class="batch-placeholder">
        <div class="empty-icon" style="font-size:40px;color:var(--red)">✗</div>
        <div class="empty-title" style="color:var(--red)">Generation failed</div>
        <div class="empty-sub">${page.error || ''}</div>
      </div>`;
    return;
  }

  const isPushed = page.status === 'pushed';
  const header = document.createElement('div');
  header.className = 'preview-header';
  header.innerHTML = `
    <div class="preview-header-left">
      <div class="preview-title">${page.content['name'] || page.name}</div>
      <div class="preview-badge ${page.hasReference ? 'preview-badge--reference' : 'preview-badge--generated'}">
        ${page.hasReference ? 'Reference used' : 'Generated from scratch ✦'}
      </div>
    </div>
    <div class="preview-actions">
      ${isPushed
        ? '<span class="batch-pushed-label">✓ Pushed</span>'
        : `<button class="btn btn--success batch-push-single-btn" data-index="${i}">✓ Push to Webflow</button>`}
    </div>`;

  const fieldSectionsEl = document.createElement('div');
  fieldSectionsEl.className = 'field-sections';
  renderFieldSections(fieldSectionsEl, page.content);

  batchContent.innerHTML = '';
  batchContent.appendChild(header);
  batchContent.appendChild(fieldSectionsEl);

  if (!isPushed) {
    batchContent.querySelector('.batch-push-single-btn')
      .addEventListener('click', () => runBatchPushSingle(i));
  }
}

async function runBatchPushSingle(i) {
  const page = batchPages[i];
  if (page.status !== 'done') return;

  const btn = document.querySelector(`.batch-push-single-btn[data-index="${i}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Pushing…'; }

  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: page.content,
        pageType: page.slug,
        location: batchLocation,
        saveReference: !page.hasReference,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Push failed');

    batchPages[i].status = 'pushed';
    existingSlugs.add(page.slug);
    saveBatchSession();
    updateBatchSidebarItem(i);
    if (batchSelectedIndex === i) renderBatchContent(i);

    const remainingReady = batchPages.filter(p => p.status === 'done').length;
    if (remainingReady === 0) {
      document.getElementById('batch-push-all-btn').classList.add('hidden');
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Push to Webflow'; }
    alert('Push failed: ' + err.message);
  }
}

async function runBatchPushAll() {
  const btn = document.getElementById('batch-push-all-btn');
  btn.disabled = true;
  btn.textContent = 'Pushing…';

  const readyIndices = batchPages
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.status === 'done')
    .map(({ i }) => i);

  for (const i of readyIndices) {
    await runBatchPushSingle(i);
  }

  btn.disabled = false;
  btn.textContent = '↑ Push All Ready';
}

/* ── Session persistence ──────────────────────────────────── */
function saveSession() {
  try {
    localStorage.setItem('ciotr_session', JSON.stringify({
      mode: 'single',
      location: currentLocation,
      pageType: currentPageType,
      content: currentContent,
      images: currentImages,
      hasReference: currentHasReference,
      elapsed: currentElapsed,
    }));
  } catch (_) {}
}

function saveBatchSession() {
  try {
    localStorage.setItem('ciotr_session', JSON.stringify({
      mode: 'batch',
      location: batchLocation,
      pages: batchPages,
      selectedIndex: batchSelectedIndex,
    }));
  } catch (_) {}
}

function restoreSession() {
  try {
    const saved = localStorage.getItem('ciotr_session');
    if (!saved) return;
    const data = JSON.parse(saved);

    if (data.mode === 'single' && data.content) {
      currentContent = data.content;
      currentLocation = data.location;
      currentPageType = data.pageType;
      currentImages = data.images || {};
      currentHasReference = data.hasReference;
      currentElapsed = data.elapsed;

      document.getElementById('location-select').value = currentLocation || '';
      document.getElementById('pagetype-select').value = currentPageType || '';
      document.getElementById('generate-btn').disabled = !currentLocation || !currentPageType;
      document.getElementById('batch-btn').disabled = !currentLocation;

      renderPreview();
      showState('preview');

    } else if (data.mode === 'batch' && data.pages?.length) {
      batchPages = data.pages;
      batchLocation = data.location;
      batchSelectedIndex = data.selectedIndex >= 0 ? data.selectedIndex : 0;

      document.getElementById('location-select').value = batchLocation || '';
      document.getElementById('batch-btn').disabled = !batchLocation;

      const completed = batchPages.filter(p => p.status === 'done' || p.status === 'pushed' || p.status === 'error').length;
      const doneCount = batchPages.filter(p => p.status === 'done').length;

      showState('batch');
      document.getElementById('batch-title').textContent = `Restored — ${batchLocation}`;
      renderBatchSidebar();
      updateBatchProgress(completed, batchPages.length);
      if (doneCount > 0) document.getElementById('batch-push-all-btn').classList.remove('hidden');
      if (batchSelectedIndex >= 0) renderBatchContent(batchSelectedIndex);
    }
  } catch (_) {
    localStorage.removeItem('ciotr_session');
  }
}

function markSavedDropdownOptions() {
  try {
    const saved = localStorage.getItem('ciotr_session');
    if (!saved) return;
    const data = JSON.parse(saved);
    const ptSel = document.getElementById('pagetype-select');

    const savedSlugs = new Set();
    if (data.mode === 'single' && data.pageType) {
      savedSlugs.add(data.pageType);
    } else if (data.mode === 'batch' && data.pages) {
      data.pages.filter(p => p.content).forEach(p => savedSlugs.add(p.slug));
    }

    for (const opt of ptSel.options) {
      if (savedSlugs.has(opt.value)) {
        opt.classList.add('has-saved');
      }
    }
  } catch (_) {}
}

/* ── Init ─────────────────────────────────────────────────── */
boot();
