// RFQ Hub - Multi-company Application Logic

const SUPABASE_URL = 'https://zilumoopwnrtrtnsmjhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbHVtb29wd25ydHJ0bnNtamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTU2MzgsImV4cCI6MjEwMTY3MTYzOH0.t8aQkOU29pwG9fwW9BlTwd4oie2jxkZa43mb3yc55kg';

let client = null;
let currentUser = null;
let currentCompany = null;
let isSuperAdmin = false;
let currentRFQId = null;
let currentRFQData = null; // full RFQ row for the RFQ currently loaded in the contractor form, so submitContractorForm can read required_documents (name/mandatory/requires_expiry) without a second fetch
let isSubmittingRFQ = false;
let platformSettings = { logo_url: null };
window.lastInvitations = [];
let pendingAskQuestionRfqId = null; // which RFQ the open "Ask a Question" modal is for
let pendingAnswerQuestionId = null; // which rfq_questions row the open "Reply" modal is answering
let rfqQuestionsById = {}; // populated by loadRFQConsole so the answer modal can look up question text without embedding free-form text in onclick attributes

const DEFAULT_HERO_SUBTITLE = "Open requests for quotation. Apply directly online — you'll get a reference number and a confirmation the moment your application is received.";

// ===== INITIALIZATION =====
async function initApp() {
  console.log('Initializing RFQ Hub...');

  // Capture the URL's search params and auth hash FIRST, before any
  // await below. Supabase's own client processes and clears the
  // #access_token=...&type=invite hash asynchronously as soon as the
  // client is created — if we read it after an await, it's often already
  // gone by the time we check it, which silently skips the "set your
  // password" screen for invite/recovery links.
  const params = new URLSearchParams(window.location.search);
  const rfqToken = params.get('rfq');
  const openRfqId = params.get('open');
  const infoToken = params.get('info');
  const prefsToken = params.get('prefs');
  const wantsAdmin = params.has('admin');
  const authType = getUrlHashParams().get('type'); // 'invite' or 'recovery' when landing from an invite/reset link

  // Wire up static form/UI listeners before touching the Supabase client —
  // this work has no network dependency, so the page stays interactive
  // (login form, settings sliders, etc.) even if the Supabase SDK is slow
  // to load from its CDN, and it means a client-creation failure below
  // can't silently skip wiring the rest of the page.
  setupStaticForms();

  client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase connected');
  await loadPlatformSettings();

  if (rfqToken) {
    console.log('Loading RFQ with token:', rfqToken);
    applyDefaultBranding();
    setHeaderActions('contractor');
    await loadContractorView(rfqToken);
    return;
  }

  if (infoToken) {
    console.log('Loading information request with token:', infoToken);
    applyDefaultBranding();
    setHeaderActions('contractor');
    await loadInfoRequestView(infoToken);
    return;
  }

  if (prefsToken) {
    console.log('Loading supplier notification preferences with token:', prefsToken);
    applyDefaultBranding();
    setHeaderActions('contractor');
    await loadSupplierPreferencesView(prefsToken);
    return;
  }

  if (openRfqId) {
    // Direct links (e.g. bookmarked/shared) must go through the same
    // registration gate as clicking "View & Apply" — show the normal
    // landing page underneath and open the gate on top of it.
    console.log('Loading public RFQ (gated):', openRfqId);
    applyDefaultBranding();
    showLandingView();
    openApplicantGate(openRfqId);
    return;
  }

  try {
    const { data: { session } } = await client.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;

      if (authType === 'invite' || authType === 'recovery') {
        // They have a valid session from the invite link but haven't set a
        // password yet — make them do that before routing into the dashboard.
        applyDefaultBranding();
        showSetPasswordView();
        return;
      }

      await loadCurrentCompanyAndRoute(wantsAdmin);
      return;
    }
  } catch (err) {
    console.error('Error checking session:', err);
  }

  applyDefaultBranding();
  if (wantsAdmin) {
    showLoginForm();
  } else {
    showLandingView();
  }
}

function setupStaticForms() {
  const loginForm = document.getElementById('login-form');
  if (loginForm && !loginForm.dataset.wired) {
    loginForm.addEventListener('submit', handleLoginSubmit);
    loginForm.dataset.wired = 'true';
  }

  const setPasswordForm = document.getElementById('set-password-form');
  if (setPasswordForm && !setPasswordForm.dataset.wired) {
    setPasswordForm.addEventListener('submit', handleSetPasswordSubmit);
    setPasswordForm.dataset.wired = 'true';
  }

  const settingsForm = document.getElementById('settings-form');
  if (settingsForm && !settingsForm.dataset.wired) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
    settingsForm.dataset.wired = 'true';
  }

  const logoFile = document.getElementById('settings-logo-file');
  if (logoFile && !logoFile.dataset.wired) {
    logoFile.addEventListener('change', handleLogoFileChange);
    logoFile.dataset.wired = 'true';
  }

  const logoScale = document.getElementById('settings-logo-scale');
  if (logoScale && !logoScale.dataset.wired) {
    logoScale.addEventListener('input', handleSettingsLogoScaleInput);
    logoScale.addEventListener('change', handleSettingsLogoScaleChange);
    logoScale.dataset.wired = 'true';
  }

  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm && !changePasswordForm.dataset.wired) {
    changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    changePasswordForm.dataset.wired = 'true';
  }

  const superChangePasswordForm = document.getElementById('super-change-password-form');
  if (superChangePasswordForm && !superChangePasswordForm.dataset.wired) {
    superChangePasswordForm.addEventListener('submit', handleSuperChangePasswordSubmit);
    superChangePasswordForm.dataset.wired = 'true';
  }

  const inviteTeammateForm = document.getElementById('invite-teammate-form');
  if (inviteTeammateForm && !inviteTeammateForm.dataset.wired) {
    inviteTeammateForm.addEventListener('submit', handleInviteTeammateSubmit);
    inviteTeammateForm.dataset.wired = 'true';
  }

  const inviteCompanyForm = document.getElementById('invite-company-form');
  if (inviteCompanyForm && !inviteCompanyForm.dataset.wired) {
    inviteCompanyForm.addEventListener('submit', handleInviteCompanySubmit);
    inviteCompanyForm.dataset.wired = 'true';
  }

  const platformLogoFile = document.getElementById('platform-logo-file');
  if (platformLogoFile && !platformLogoFile.dataset.wired) {
    platformLogoFile.addEventListener('change', handlePlatformLogoFileChange);
    platformLogoFile.dataset.wired = 'true';
  }

  const platformLogoScale = document.getElementById('platform-logo-scale');
  if (platformLogoScale && !platformLogoScale.dataset.wired) {
    platformLogoScale.addEventListener('input', handlePlatformLogoScaleInput);
    platformLogoScale.addEventListener('change', handlePlatformLogoScaleChange);
    platformLogoScale.dataset.wired = 'true';
  }

  const gateEmailForm = document.getElementById('gate-email-form');
  if (gateEmailForm && !gateEmailForm.dataset.wired) {
    gateEmailForm.addEventListener('submit', handleGateEmailSubmit);
    gateEmailForm.dataset.wired = 'true';
  }

  const gateRegisterForm = document.getElementById('gate-register-form');
  if (gateRegisterForm && !gateRegisterForm.dataset.wired) {
    gateRegisterForm.addEventListener('submit', handleGateRegisterSubmit);
    gateRegisterForm.dataset.wired = 'true';
  }

  const askQuestionForm = document.getElementById('ask-question-form');
  if (askQuestionForm && !askQuestionForm.dataset.wired) {
    askQuestionForm.addEventListener('submit', handleAskQuestionSubmit);
    askQuestionForm.dataset.wired = 'true';
  }

  const answerQuestionForm = document.getElementById('answer-question-form');
  if (answerQuestionForm && !answerQuestionForm.dataset.wired) {
    answerQuestionForm.addEventListener('submit', handleAnswerQuestionSubmit);
    answerQuestionForm.dataset.wired = 'true';
  }
}

function renderPlatformLogoPreview() {
  const preview = document.getElementById('platform-logo-preview');
  const placeholder = document.getElementById('platform-logo-placeholder');
  const scaleInput = document.getElementById('platform-logo-scale');
  const scaleLabel = document.getElementById('platform-logo-scale-label');
  if (!preview || !placeholder) return;

  const scale = (platformSettings && platformSettings.logo_scale) || 1;
  if (scaleInput) scaleInput.value = Math.round(scale * 100);
  if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;

  if (platformSettings && platformSettings.logo_url) {
    applyLogoScale(preview, scale);
    preview.src = platformSettings.logo_url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

function handlePlatformLogoScaleInput(e) {
  const pct = Number(e.target.value);
  const label = document.getElementById('platform-logo-scale-label');
  if (label) label.textContent = `${pct}%`;
  const preview = document.getElementById('platform-logo-preview');
  if (preview && preview.style.display !== 'none') {
    applyLogoScale(preview, pct / 100);
  }
}

async function handlePlatformLogoScaleChange(e) {
  if (!isSuperAdmin) return;
  const pct = Number(e.target.value);
  const scale = Math.min(1.5, Math.max(0.5, pct / 100));
  try {
    const { error } = await client
      .from('platform_settings')
      .update({ logo_scale: scale, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;

    platformSettings = { ...platformSettings, logo_scale: scale };

    const brandImg = document.getElementById('brand-logo-img');
    if (brandImg && brandImg.style.display !== 'none') {
      applyLogoScale(brandImg, scale);
    }

    showToast('✅ Logo size saved', 'success');
  } catch (err) {
    console.error('Error saving logo size:', err);
    showToast('❌ Error saving logo size: ' + err.message, 'error');
  }
}

async function handlePlatformLogoFileChange(e) {
  const file = e.target.files[0];
  if (!file || !isSuperAdmin) return;

  try {
    showToast('Uploading logo...', 'info');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `platform/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('company-logos')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage.from('company-logos').getPublicUrl(path);
    const logoUrl = urlData.publicUrl;

    const { error: updateError } = await client
      .from('platform_settings')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (updateError) throw updateError;

    platformSettings = { ...platformSettings, logo_url: logoUrl };
    renderPlatformLogoPreview();
    showToast('✅ Platform logo updated', 'success');
  } catch (err) {
    console.error('Platform logo upload error:', err);
    showToast('❌ Error uploading logo: ' + err.message, 'error');
  }
}

function getUrlHashParams() {
  const hash = window.location.hash && window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : (window.location.hash || '');
  return new URLSearchParams(hash);
}

// ===== VIEW SWITCHING =====
function hideAllTopLevelViews() {
  document.getElementById('public-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('super-admin-view').style.display = 'none';
  const heroExtras = document.getElementById('hero-marketplace-extras');
  if (heroExtras) heroExtras.style.display = 'none';
  closeMobileNav();
}

function hideAllPublicSections() {
  ['rfq-portal', 'no-rfq-message', 'landing-section', 'login-section', 'set-password-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// mode: 'loggedOut' (landing — full Sign In + Register Free), 'contractor'
// (viewing/applying to a specific RFQ — Sign In only, Register Free would
// be redundant mid-flow), 'form' (already on the login/set-password page —
// no action buttons needed). Admin/super-admin views never call this, so
// whatever the last mode was (always 'form', reached via login) persists,
// which correctly shows no public CTAs while logged in.
function setHeaderActions(mode) {
  const el = document.getElementById('header-actions');
  if (!el) return;
  if (mode === 'loggedOut') {
    el.innerHTML = `
      <button onclick="showLoginForm()" class="btn header-signin" type="button">Sign In</button>
      <button onclick="openApplicantGate(null)" class="btn header-register" type="button">Register Free</button>
    `;
  } else if (mode === 'contractor') {
    el.innerHTML = `
      <button onclick="showLoginForm()" class="btn header-signin" type="button">Sign In</button>
    `;
  } else {
    el.innerHTML = '';
  }
}

function toggleMobileNav() {
  const wrap = document.getElementById('site-nav-wrap');
  const toggle = document.getElementById('mobile-nav-toggle');
  if (!wrap) return;
  const isOpen = wrap.classList.toggle('open');
  if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeMobileNav() {
  const wrap = document.getElementById('site-nav-wrap');
  const toggle = document.getElementById('mobile-nav-toggle');
  if (wrap) wrap.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

// ===== PUBLIC NAV LINKS =====
// "Opportunities" / "How It Works" always route back to the landing page
// first (they need to work from any public page — an RFQ detail page, the
// login form, etc.) then scroll to the relevant section once it's rendered.
function navGoOpportunities() {
  showLandingView();
  setTimeout(() => {
    const el = document.getElementById('public-rfq-list');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 50);
}

function navGoHowItWorks() {
  showLandingView();
  setTimeout(() => {
    const el = document.getElementById('how-it-works-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 50);
}

// About/Help/Terms don't have real content yet — a placeholder modal is
// shown rather than inventing company copy or legal text. Easy to swap for
// a real page later without touching any of the calling code.
function showInfoPlaceholder(title, body) {
  document.getElementById('info-page-modal-title').textContent = title;
  document.getElementById('info-page-modal-body').textContent = body;
  openModal('info-page-modal');
}

function navGoAbout() {
  closeMobileNav();
  showInfoPlaceholder('About', 'This page is coming soon. In the meantime, reach out using the Help link if you have questions about the platform.');
}

function navGoHelp() {
  closeMobileNav();
  showInfoPlaceholder('Need Help?', "If you run into any issues, or anything doesn't match what you're seeing on screen, email ihubsa@gmail.com and we'll help you sort it out.");
}

function navGoTerms() {
  closeMobileNav();
  openModal('terms-modal');
}

function showLandingView() {
  hideAllTopLevelViews();
  document.getElementById('public-view').style.display = 'block';
  hideAllPublicSections();
  document.getElementById('landing-section').style.display = 'block';
  setHeaderActions('loggedOut');

  document.getElementById('hero-title').textContent = 'Find Your Next Business Opportunity';
  document.getElementById('hero-subtitle').textContent = 'Discover open Requests for Quotation from organisations looking for qualified suppliers and service providers.';
  const heroExtras = document.getElementById('hero-marketplace-extras');
  if (heroExtras) heroExtras.style.display = 'block';

  loadPublicRFQList();
  loadPublicPortalStats();
}

// ===== PUBLIC RFQ PORTAL =====
const ICON_CALENDAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICON_PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_TAG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24L4 3v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.83 0l3.59-3.59a2 2 0 0 0 0-2.83z"/><circle cx="8" cy="8" r="1.5"/></svg>';

// Computes {days, hrs, mins} remaining until an ISO deadline, clamped to
// zero once it has passed (the public list only ever fetches future
// deadlines, but a card can outlive its deadline while a visitor is
// still on the page).
function computeCountdownParts(deadlineIso) {
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  if (diffMs <= 0) return { days: 0, hrs: 0, mins: 0 };
  const totalMins = Math.floor(diffMs / 60000);
  return {
    days: Math.floor(totalMins / 1440),
    hrs: Math.floor((totalMins % 1440) / 60),
    mins: totalMins % 60
  };
}

// Buckets remaining time into an urgency status so cards can visually
// communicate how soon an RFQ closes, not just show raw numbers.
function computeUrgency(deadlineIso) {
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  const hrsRemaining = diffMs / 3600000;
  if (diffMs <= 0) return { status: 'closed', label: 'Closed', badgeClass: 'badge-closed' };
  if (hrsRemaining < 24) return { status: 'closing-today', label: 'Closing Today', badgeClass: 'badge-closing-today' };
  if (hrsRemaining < 48) return { status: 'closing-soon', label: 'Closing Soon', badgeClass: 'badge-closing-soon' };
  return { status: 'open', label: 'Open', badgeClass: 'badge-open' };
}

let countdownIntervalStarted = false;
function updateAllCountdowns() {
  document.querySelectorAll('.countdown-units[data-deadline]').forEach(el => {
    const parts = computeCountdownParts(el.dataset.deadline);
    const daysEl = el.querySelector('.cd-days');
    const hrsEl = el.querySelector('.cd-hrs');
    const minsEl = el.querySelector('.cd-mins');
    if (daysEl) daysEl.textContent = parts.days;
    if (hrsEl) hrsEl.textContent = parts.hrs;
    if (minsEl) minsEl.textContent = parts.mins;

    const urgency = computeUrgency(el.dataset.deadline);
    const box = el.closest('.countdown-box');
    if (box) {
      box.classList.remove('urgency-closing-soon', 'urgency-closing-today', 'urgency-closed');
      if (urgency.status !== 'open') box.classList.add(`urgency-${urgency.status}`);
      const labelEl = box.querySelector('.countdown-urgency-label');
      if (labelEl) {
        labelEl.textContent = urgency.status === 'closed' ? 'Closed' : (urgency.status === 'open' ? 'Closing In' : urgency.label);
        labelEl.className = `countdown-urgency-label ${urgency.status}`;
      }
    }

    // Keep the card's top status badge (and its colour-coded left border)
    // in sync too, in case a visitor lingers long enough for an RFQ to
    // cross an urgency threshold.
    const card = el.closest('.opportunity-card');
    if (card) {
      card.classList.remove('status-open', 'status-closing-soon', 'status-closing-today', 'status-closed');
      card.classList.add(`status-${urgency.status}`);
    }
    const badgeEl = card ? card.querySelector('.opportunity-status-badge') : null;
    if (badgeEl) {
      badgeEl.className = `opportunity-status-badge ${urgency.badgeClass}`;
      badgeEl.textContent = urgency.label;
    }
  });
}
function ensureCountdownTicking() {
  if (countdownIntervalStarted) return;
  countdownIntervalStarted = true;
  setInterval(updateAllCountdowns, 30000);
}

function clearOpportunityFilters() {
  const provinceEl = document.getElementById('public-rfq-province-filter');
  const searchEl = document.getElementById('hero-search-input');
  const sortEl = document.getElementById('public-rfq-sort');
  if (provinceEl) provinceEl.value = '';
  if (searchEl) searchEl.value = '';
  if (sortEl) sortEl.value = 'deadline_asc';
  loadPublicRFQList();
}

async function loadPublicRFQList() {
  const listEl = document.getElementById('public-rfq-list');
  if (!listEl) return;

  const provinceEl = document.getElementById('public-rfq-province-filter');
  const searchEl = document.getElementById('hero-search-input');
  const sortEl = document.getElementById('public-rfq-sort');
  const province = provinceEl ? provinceEl.value : '';
  const searchText = (searchEl ? searchEl.value : '').trim().toLowerCase();
  const sortMode = sortEl ? sortEl.value : 'deadline_asc';
  const hasActiveFilters = !!(province || searchText);

  listEl.innerHTML = '<p style="color:var(--border);">Loading...</p>';

  try {
    let query = client
      .from('rfqs')
      .select('id, rfq_name, project_name, description, deadline, budget, company_id, province, location_area')
      .eq('is_public', true)
      .gt('deadline', new Date().toISOString());

    if (province) {
      query = query.eq('province', province);
    }

    const { data: fetchedRfqs, error } = await query;
    if (error) throw error;

    let rfqs = fetchedRfqs || [];

    // Fetch companies before filtering/rendering so search can match on
    // company name too, and so the "Organisations Using the Platform"
    // strip can be built from the same real, already-public data — no
    // separate query and nothing invented.
    const companyIds = [...new Set(rfqs.map(r => r.company_id).filter(Boolean))];
    let companiesById = {};
    if (companyIds.length > 0) {
      const { data: companies } = await client
        .from('companies')
        .select('id, name, logo_url, logo_scale')
        .in('id', companyIds);
      companiesById = Object.fromEntries((companies || []).map(c => [c.id, c]));
    }
    renderOrgLogos(companiesById);

    if (searchText) {
      rfqs = rfqs.filter(r => {
        const company = companiesById[r.company_id];
        return (r.rfq_name || '').toLowerCase().includes(searchText) ||
          (r.project_name || '').toLowerCase().includes(searchText) ||
          (r.description || '').toLowerCase().includes(searchText) ||
          (r.location_area || '').toLowerCase().includes(searchText) ||
          (r.province || '').toLowerCase().includes(searchText) ||
          (company && company.name || '').toLowerCase().includes(searchText);
      });
    }

    if (sortMode === 'deadline_desc') {
      rfqs.sort((a, b) => new Date(b.deadline) - new Date(a.deadline));
    } else if (sortMode === 'budget_desc') {
      rfqs.sort((a, b) => (b.budget || 0) - (a.budget || 0));
    } else {
      rfqs.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    }

    if (rfqs.length === 0) {
      listEl.innerHTML = hasActiveFilters
        ? `<div class="opp-empty-state">
             <h4>No Open Opportunities</h4>
             <p>There are currently no open RFQs matching your search.</p>
             <button type="button" class="btn secondary" onclick="clearOpportunityFilters()">Clear Filters</button>
           </div>`
        : `<div class="opp-empty-state">
             <h4>No Open Opportunities</h4>
             <p>There are currently no open RFQs. Check back soon for new opportunities.</p>
           </div>`;
      return;
    }

    listEl.innerHTML = rfqs.map(rfq => {
      const company = companiesById[rfq.company_id];
      const deadlineDate = new Date(rfq.deadline);
      const locationParts = [rfq.location_area, rfq.province].filter(Boolean);
      const locationText = locationParts.join(', ');
      const cardLogoScale = Math.min(1.5, Math.max(0.5, (company && company.logo_scale) || 1));
      const cardLogoHeight = Math.round(40 * cardLogoScale);
      const cardLogoMaxWidth = Math.round(130 * cardLogoScale);
      const urgency = computeUrgency(rfq.deadline);
      const refCode = `RFQ-${rfq.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      return `
        <div class="opportunity-card status-${urgency.status}" onclick="openApplicantGate('${rfq.id}')">
          <div class="opportunity-card-grid">
            <div class="opportunity-col-info">
              <span class="opportunity-status-badge ${urgency.badgeClass}">${urgency.label}</span>
              <p class="opportunity-ref">${refCode}</p>
              <h3 style="margin:0 0 6px 0; color:var(--primary);">${rfq.rfq_name}</h3>
              <p style="margin:0 0 8px 0; font-size:12px; text-transform:uppercase; color:var(--border); font-weight:bold; display:flex; align-items:center; gap:8px;">
                ${company && company.logo_url ? `<img src="${company.logo_url}" alt="${company.name}" style="height:${Math.min(cardLogoHeight, 22)}px; width:auto; max-width:${cardLogoMaxWidth}px; object-fit:contain;">` : ''}
                ${company ? company.name : 'RFQ Hub'}
              </p>
              <p style="margin:0; color:var(--ink); font-size:14px;">${rfq.description}</p>
            </div>
            <div class="opportunity-col-meta">
              <div class="opportunity-meta-row">${ICON_CALENDAR}<div><span class="opportunity-meta-label">Closing Date</span>${deadlineDate.toLocaleDateString()} at ${deadlineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>
              ${locationText ? `<div class="opportunity-meta-row">${ICON_PIN}<div><span class="opportunity-meta-label">Location</span>${locationText}</div></div>` : ''}
              <div class="opportunity-meta-row">${ICON_TAG}<div><span class="opportunity-meta-label">Project</span>${rfq.project_name}</div></div>
            </div>
            <div class="opportunity-col-countdown">
              <div class="countdown-box">
                <p class="countdown-urgency-label ${urgency.status}">${urgency.status === 'closed' ? 'Closed' : 'Closing In'}</p>
                <div class="countdown-units" data-deadline="${rfq.deadline}">
                  <div><div class="countdown-unit-num cd-days">--</div><div class="countdown-unit-label">Days</div></div>
                  <div><div class="countdown-unit-num cd-hrs">--</div><div class="countdown-unit-label">Hrs</div></div>
                  <div><div class="countdown-unit-num cd-mins">--</div><div class="countdown-unit-label">Mins</div></div>
                </div>
                <button type="button" class="btn navy" style="width:100%; padding:10px; margin-top:14px;" onclick="event.stopPropagation(); openApplicantGate('${rfq.id}')">View Opportunity →</button>
                <button type="button" class="btn secondary" style="width:100%; padding:10px; margin-top:8px;" onclick="event.stopPropagation(); openAskQuestionModal('${rfq.id}', '${escapeHtmlClient(rfq.rfq_name).replace(/'/g, "\\'")}')">❓ Ask a Question</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    updateAllCountdowns();
    ensureCountdownTicking();
  } catch (err) {
    console.error('Error loading public RFQ list:', err);
    listEl.innerHTML = '<p style="color:var(--warning);">Error loading open RFQs.</p>';
  }
}

// Real, already-public data only: companies that currently have at least
// one open RFQ listed and a logo on file. No invented organisations.
function renderOrgLogos(companiesById) {
  const section = document.getElementById('org-logos-section');
  const grid = document.getElementById('org-logos-grid');
  if (!section || !grid) return;

  const withLogos = Object.values(companiesById).filter(c => c && c.logo_url);
  if (withLogos.length === 0) {
    section.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = withLogos.map(c => `<img src="${c.logo_url}" alt="${c.name}" title="${c.name}">`).join('');
  section.style.display = 'block';
}

// Narrow aggregate-only stats (see get_public_portal_stats RPC) — real
// counts, never invented. Any stat that's currently zero is omitted
// rather than shown as "0 X", and the whole row stays hidden if the call
// fails or every count is zero.
async function loadPublicPortalStats() {
  const row = document.getElementById('hero-stats-row');
  if (!row) return;
  row.style.display = 'none';
  row.innerHTML = '';

  try {
    const { data, error } = await client.rpc('get_public_portal_stats');
    if (error) throw error;
    const stats = Array.isArray(data) ? data[0] : data;
    if (!stats) return;

    const items = [
      { num: stats.open_opportunities, label: 'Open Opportunities' },
      { num: stats.registered_suppliers, label: 'Registered Suppliers' },
      { num: stats.organisations, label: 'Organisations' }
    ].filter(item => Number(item.num) > 0);

    if (items.length === 0) return;

    row.innerHTML = items.map(item => `
      <div class="hero-stat">
        <div class="hero-stat-num">${item.num}</div>
        <div class="hero-stat-label">${item.label}</div>
      </div>
    `).join('');
    row.style.display = 'flex';
  } catch (err) {
    console.warn('Could not load public portal stats:', err);
  }
}

// ===== APPLICANT REGISTRATION GATE =====
// Anyone browsing the public "Open RFQs" list must be a registered
// applicant before they can view an RFQ's details or apply. We check
// their email against the applicant_registrations table via a narrow,
// SECURITY DEFINER RPC that only ever returns true/false — it never
// exposes any applicant's data to the public. If the email isn't on
// file, we collect a quick registration first.
let pendingGateRfqId = null;
// Status of the applicant who most recently passed the gate — { status,
// status_reason } or null if unknown/active. Suspended/removed suppliers
// can still browse/view RFQs (per Brent's explicit instruction) but the
// contractor submission form uses this to warn them upfront and disable
// the Submit button, backed by a hard DB-level block either way (see the
// rfq_submissions insert policy) so this is a UX convenience, not the
// actual enforcement.
let currentApplicantStatus = null;

function openApplicantGate(rfqId) {
  pendingGateRfqId = rfqId;

  // Reset every field on the gate — both the quick email step and the full
  // Supplier Database registration form (name/company/contact/address/
  // services/documents/declaration) — so a previous attempt never bleeds
  // into a fresh one.
  const fieldIds = [
    'gate-email', 'gate-company-name', 'gate-years-business', 'gate-full-name',
    'gate-title', 'gate-designation', 'gate-phone', 'gate-additional-phone',
    'gate-address', 'gate-province', 'gate-website', 'gate-services-description',
    'gate-service-areas'
  ];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fileIds = [
    'gate-doc-cipc', 'gate-doc-proof-address', 'gate-doc-sars', 'gate-doc-banking',
    'gate-doc-bbbee', 'gate-doc-health-safety', 'gate-doc-permits', 'gate-doc-other'
  ];
  fileIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const declarationEl = document.getElementById('gate-declaration-accept');
  if (declarationEl) declarationEl.checked = false;
  currentApplicantStatus = null;

  // "Register Free" / "Register as a Supplier" open this same gate with no
  // specific RFQ in mind (rfqId is null) — swap the copy so it reads as a
  // general supplier registration rather than implying a specific RFQ.
  const titleEl = document.getElementById('gate-modal-title');
  const introEl = document.getElementById('gate-modal-intro');
  if (titleEl) titleEl.textContent = rfqId ? 'Register to View & Apply' : 'Register as a Supplier';
  if (introEl) introEl.textContent = rfqId
    ? "To view this RFQ's details and apply, please confirm your email. It only takes a moment."
    : "Register your email to start browsing and applying to open RFQs. It only takes a moment.";

  document.getElementById('gate-email-section').style.display = 'block';
  document.getElementById('gate-register-section').style.display = 'none';
  closeMobileNav();
  openModal('applicant-gate-modal');
}

function gateBackToEmail() {
  document.getElementById('gate-email-section').style.display = 'block';
  document.getElementById('gate-register-section').style.display = 'none';
}

async function handleGateEmailSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('gate-email').value.trim();
  if (!email) return;

  const submitBtn = document.getElementById('gate-email-submit');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking...';

  try {
    const { data: isRegistered, error } = await client.rpc('check_applicant_registered', { p_email: email });
    if (error) throw error;

    if (isRegistered) {
      // Best-effort — used only to warn/disable-apply in the RFQ view
      // below, never to block viewing itself. A failure here shouldn't
      // stop an otherwise-fine registered visitor from proceeding.
      currentApplicantStatus = null;
      try {
        const { data: statusRows } = await client.rpc('check_applicant_status', { p_email: email });
        currentApplicantStatus = (statusRows && statusRows[0]) || null;
      } catch (statusErr) {
        console.warn('Could not check applicant status:', statusErr.message);
      }

      if (currentApplicantStatus && currentApplicantStatus.status === 'suspended') {
        showToast('⚠️ Your supplier registration is suspended. You can view RFQs but can\'t apply — contact us for details.', 'error');
      } else if (currentApplicantStatus && currentApplicantStatus.status === 'removed') {
        showToast('⚠️ Your supplier registration has been removed. You can view RFQs but can\'t apply — contact us for details.', 'error');
      } else {
        showToast(pendingGateRfqId ? '👋 Welcome back! Loading RFQ...' : '👋 Welcome back! You\'re already registered.', 'success');
      }
      proceedPastGate();
    } else {
      document.getElementById('gate-email-section').style.display = 'none';
      document.getElementById('gate-register-section').style.display = 'block';
    }
  } catch (err) {
    console.error('Error checking registration:', err);
    showToast('❌ Could not check registration. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

// Uploads one supplier registration document to the private
// 'supplier-documents' bucket, folder-scoped by the client-generated
// applicant id so files from different registrants never collide. Returns
// the storage path (not a public URL — the bucket is private and only
// readable by the super admin, same trust model as the table itself).
async function uploadSupplierDocument(applicantId, keyPrefix, file) {
  const filePath = `applicant-${applicantId}/${keyPrefix}-${Date.now()}-${file.name}`;
  const { error } = await client.storage.from('supplier-documents').upload(filePath, file);
  if (error) throw error;
  return filePath;
}

async function handleGateRegisterSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('gate-email').value.trim();
  const companyName = document.getElementById('gate-company-name').value.trim();
  const yearsInBusiness = document.getElementById('gate-years-business').value.trim();
  const fullName = document.getElementById('gate-full-name').value.trim();
  const title = document.getElementById('gate-title').value;
  const designation = document.getElementById('gate-designation').value.trim();
  const phone = document.getElementById('gate-phone').value.trim();
  const additionalPhone = document.getElementById('gate-additional-phone').value.trim();
  const address = document.getElementById('gate-address').value.trim();
  const provinceEl = document.getElementById('gate-province');
  const province = provinceEl ? provinceEl.value : '';
  const website = document.getElementById('gate-website').value.trim();
  const servicesDescription = document.getElementById('gate-services-description').value.trim();
  const serviceAreas = document.getElementById('gate-service-areas').value.trim();
  const declarationAccepted = document.getElementById('gate-declaration-accept').checked;

  const cipcFile = document.getElementById('gate-doc-cipc').files[0];
  const proofAddressFile = document.getElementById('gate-doc-proof-address').files[0];
  const sarsFile = document.getElementById('gate-doc-sars').files[0];
  const bankingFile = document.getElementById('gate-doc-banking').files[0];
  const bbbeeFile = document.getElementById('gate-doc-bbbee').files[0];
  const healthSafetyFile = document.getElementById('gate-doc-health-safety').files[0];
  const permitsFile = document.getElementById('gate-doc-permits').files[0];
  const otherFiles = Array.from(document.getElementById('gate-doc-other').files || []);

  // The form's own `required` attributes already block submission for most
  // of these (native HTML5 validation), but the email field belongs to the
  // earlier step's form, not this one, so it's not covered by that — worth
  // a defensive check. A couple of others are double-checked too since a
  // clear error here beats a confusing DB constraint failure below.
  if (!email || !companyName || !fullName) {
    showToast('❌ Please fill in your email, company name and main contact person.', 'error');
    return;
  }
  if (!province) {
    showToast('❌ Please select a province (or "All Provinces") so we know what to notify you about.', 'error');
    return;
  }
  if (!cipcFile || !proofAddressFile || !sarsFile) {
    showToast('❌ Please upload CIPC Registration/ID, Proof of Address, and SARS Information — these are required.', 'error');
    return;
  }
  if (!declarationAccepted) {
    showToast('❌ Please accept the Declaration to continue.', 'error');
    return;
  }

  const submitBtn = document.getElementById('gate-register-submit');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading documents...';

  // Generate the row's id client-side (same pattern used for rfq_submissions
  // and rfq_questions) so uploaded files can be folder-scoped to it before
  // the row exists, and so we never need to chain .select() onto the insert
  // below — applicant_registrations' SELECT policy is super-admin-only, so
  // an anonymous registrant reading the row back via RETURNING would 401.
  const applicantId = generateUUID();

  try {
    const [cipcPath, proofAddressPath, sarsPath] = await Promise.all([
      uploadSupplierDocument(applicantId, 'cipc', cipcFile),
      uploadSupplierDocument(applicantId, 'proof-of-address', proofAddressFile),
      uploadSupplierDocument(applicantId, 'sars', sarsFile)
    ]);

    // Optional documents: upload what was provided, but don't let a single
    // optional-upload failure block the whole registration — the required
    // documents above already succeeded, so log and continue.
    const uploadOptional = async (file, key) => {
      if (!file) return null;
      try {
        return await uploadSupplierDocument(applicantId, key, file);
      } catch (err) {
        console.warn(`⚠️ Optional document "${key}" failed to upload:`, err.message);
        return null;
      }
    };
    const [bankingPath, bbbeePath, healthSafetyPath, permitsPath] = await Promise.all([
      uploadOptional(bankingFile, 'banking'),
      uploadOptional(bbbeeFile, 'bbbee'),
      uploadOptional(healthSafetyFile, 'health-safety'),
      uploadOptional(permitsFile, 'permits')
    ]);

    const otherDocuments = [];
    for (const file of otherFiles) {
      const path = await uploadOptional(file, 'other');
      if (path) otherDocuments.push({ name: file.name, path });
    }

    submitBtn.textContent = 'Registering...';

    const { error } = await client
      .from('applicant_registrations')
      .insert({
        id: applicantId,
        full_name: fullName,
        company_name: companyName,
        email,
        phone: phone || null,
        province,
        years_in_business: parseInt(yearsInBusiness, 10) || 0,
        title,
        designation,
        additional_phone: additionalPhone || null,
        address,
        website_social: website || null,
        services_description: servicesDescription,
        service_areas: serviceAreas,
        declaration_accepted: declarationAccepted,
        cipc_document_path: cipcPath,
        proof_of_address_document_path: proofAddressPath,
        sars_document_path: sarsPath,
        proof_of_banking_document_path: bankingPath,
        bbbee_document_path: bbbeePath,
        health_safety_document_path: healthSafetyPath,
        special_permits_document_path: permitsPath,
        other_documents: otherDocuments
      });
    // A duplicate email (e.g. a race with another tab, or someone
    // double-submitting) isn't a real problem here — they're registered
    // either way, so let them through rather than showing an error.
    if (error && error.code !== '23505') throw error;

    showToast(pendingGateRfqId ? '✅ Registered! Loading RFQ...' : '✅ You\'re registered! Browse open opportunities below.', 'success');
    proceedPastGate();
  } catch (err) {
    console.error('Error registering applicant:', err);
    showToast('❌ Registration failed: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function proceedPastGate() {
  closeModal('applicant-gate-modal');
  const rfqId = pendingGateRfqId;
  pendingGateRfqId = null;
  if (!rfqId) {
    // Generic "Register Free" / "Register as a Supplier" — nothing to
    // open, just take them to the listings they can now apply to.
    const listEl = document.getElementById('public-rfq-list');
    if (listEl) listEl.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('open', rfqId);
  window.history.replaceState({}, '', url);
  loadOpenRFQView(rfqId);
}

// ===== RFQ QUESTIONS & ANSWERS =====
// Deliberately its own self-contained modal (own email/name fields) rather
// than reusing the applicant-gate flow — contractors should be able to ask
// a quick question without registering, and this avoids any risk of
// disturbing the already-working gate/registration logic above.
function openAskQuestionModal(rfqId, rfqName) {
  pendingAskQuestionRfqId = rfqId;
  const nameEl = document.getElementById('ask-question-rfq-name');
  if (nameEl) nameEl.textContent = rfqName || '';
  const form = document.getElementById('ask-question-form');
  if (form) form.reset();
  closeMobileNav();
  openModal('ask-question-modal');
}

async function handleAskQuestionSubmit(e) {
  e.preventDefault();
  if (!pendingAskQuestionRfqId) return;

  const email = document.getElementById('ask-question-email').value.trim();
  const name = document.getElementById('ask-question-name').value.trim();
  const question = document.getElementById('ask-question-text').value.trim();

  if (!email || !question) {
    showToast('❌ Please enter your email and a question.', 'error');
    return;
  }

  const submitBtn = document.getElementById('ask-question-submit');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    // Generate the id client-side (same pattern as submitContractorForm's
    // submissionId) rather than using .select() to read the row back after
    // insert. The asker is unauthenticated and rfq_questions' SELECT policy
    // is scoped to the RFQ's own company/super-admin only, so a post-insert
    // .select() has no RLS permission to read the row back and fails with a
    // 401 — the row is still inserted, but the client never sees it.
    const questionId = generateUUID();

    const { error } = await client
      .from('rfq_questions')
      .insert({
        id: questionId,
        rfq_id: pendingAskQuestionRfqId,
        applicant_email: email,
        applicant_name: name || null,
        question
      });

    if (error) throw error;

    showToast('✅ Your question has been sent.', 'success');
    closeModal('ask-question-modal');

    // Best-effort staff notification — the question is already saved either
    // way, so a failure here (e.g. no contact email on file, Resend hiccup)
    // shouldn't be shown to the asker as an error.
    callPublicEdgeFunction('notify-new-rfq-question', { questionId })
      .catch(err => console.error('notify-new-rfq-question failed:', err));
  } catch (err) {
    console.error('Error submitting question:', err);
    showToast('❌ Could not send your question: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function openAnswerQuestionModal(questionId) {
  pendingAnswerQuestionId = questionId;
  const textEl = document.getElementById('answer-question-text');
  // Looked up from the map built while rendering the RFQ Console rather
  // than passed inline through onclick, since question text is free-form
  // (can contain quotes/newlines) and unsafe to embed in an HTML attribute.
  if (textEl) textEl.textContent = (rfqQuestionsById[questionId] && rfqQuestionsById[questionId].question) || '';
  const form = document.getElementById('answer-question-form');
  if (form) form.reset();
  openModal('answer-question-modal');
}

async function handleAnswerQuestionSubmit(e) {
  e.preventDefault();
  if (!pendingAnswerQuestionId) return;

  const answer = document.getElementById('answer-question-response').value.trim();
  const visibilityInput = document.querySelector('input[name="answer-visibility"]:checked');
  const visibility = visibilityInput ? visibilityInput.value : 'public';

  if (!answer) {
    showToast('❌ Please enter an answer.', 'error');
    return;
  }

  const submitBtn = document.getElementById('answer-question-submit');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    await callEdgeFunction('answer-rfq-question', {
      questionId: pendingAnswerQuestionId,
      answer,
      visibility
    });

    showToast('✅ Answer sent.', 'success');
    closeModal('answer-question-modal');
    pendingAnswerQuestionId = null;
    loadRFQConsole();
  } catch (err) {
    console.error('Error sending answer:', err);
    showToast('❌ Could not send answer: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function showLoginForm() {
  hideAllTopLevelViews();
  document.getElementById('public-view').style.display = 'block';
  hideAllPublicSections();
  document.getElementById('login-section').style.display = 'block';
  setHeaderActions('form');
  // The marketplace hero copy ("Find Your Next Business Opportunity...")
  // is only meant for the public landing page — reset it back to the
  // neutral default so it doesn't linger behind the login card when
  // someone clicks "Sign In" straight off the landing page.
  applyDefaultBranding();
}

function showSetPasswordView() {
  hideAllTopLevelViews();
  document.getElementById('public-view').style.display = 'block';
  hideAllPublicSections();
  document.getElementById('set-password-section').style.display = 'block';
  setHeaderActions('form');
  applyDefaultBranding();
}

// ===== BRANDING =====
async function loadPlatformSettings() {
  try {
    const { data, error } = await client
      .from('platform_settings')
      .select('logo_url, logo_scale')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data) {
      platformSettings = data;
    }
  } catch (err) {
    console.warn('Could not load platform settings:', err);
  }
}

function updateFooterCompanyName(name) {
  const el = document.getElementById('footer-company-name');
  if (el) el.textContent = name || 'RFQ Hub';
}

// Base header logo size at 100% scale. A company/platform's logo_scale
// (0.5–1.5, enforced server-side too) multiplies both dimensions so a
// wide wordmark still keeps its aspect ratio via object-fit:contain.
const BASE_LOGO_HEIGHT = 84;
const BASE_LOGO_MAX_WIDTH = 260;

function applyLogoScale(imgEl, scale) {
  const s = Math.min(1.5, Math.max(0.5, Number(scale) || 1));
  imgEl.style.height = `${Math.round(BASE_LOGO_HEIGHT * s)}px`;
  imgEl.style.maxWidth = `${Math.round(BASE_LOGO_MAX_WIDTH * s)}px`;
}

// The very top masthead (logo + title + subtitle) is platform-level
// branding — it always shows the platform's own logo (set on the Platform
// Branding tab) and "Public RFQ Hub", regardless of which company's
// dashboard or public RFQ page is currently showing. Company-specific
// branding only appears further down the page (hero section, dashboard
// header bar, footer).
function applyPlatformMasthead() {
  document.getElementById('brand-title').textContent = 'Public RFQ Hub';
  document.getElementById('brand-subtitle').textContent = 'Request for Quotation Management System';

  const img = document.getElementById('brand-logo-img');
  const def = document.getElementById('brand-logo-default');
  if (platformSettings && platformSettings.logo_url) {
    applyLogoScale(img, platformSettings.logo_scale);
    img.src = platformSettings.logo_url;
    img.style.display = 'block';
    def.style.display = 'none';
  } else {
    img.style.display = 'none';
    def.style.display = 'block';
  }
}

function applyDefaultBranding() {
  applyPlatformMasthead();
  document.getElementById('hero-title').textContent = 'RFQ Hub';
  document.getElementById('hero-subtitle').textContent = DEFAULT_HERO_SUBTITLE;
  updateFooterCompanyName('RFQ Hub');
}

function applyCompanyBranding(company, opts = {}) {
  if (!company) { applyDefaultBranding(); return; }

  applyPlatformMasthead();
  document.getElementById('hero-title').textContent = opts.heroTitle || company.name || 'RFQ Hub';
  document.getElementById('hero-subtitle').textContent = opts.heroSubtitle || DEFAULT_HERO_SUBTITLE;
  updateFooterCompanyName(company.name);
}

// ===== AUTH =====
async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return;

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    showToast('Welcome back!', 'success');
    await loadCurrentCompanyAndRoute(false);
  } catch (err) {
    console.error('Login error:', err);
    showToast('Login failed: ' + err.message, 'error');
  }
}

async function handleSetPasswordSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('set-password-new').value;
  const confirmPassword = document.getElementById('set-password-confirm').value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;

    // Drop the invite/recovery hash so a page refresh doesn't re-trigger this view
    history.replaceState(null, '', window.location.pathname + window.location.search);

    showToast('✅ Password set!', 'success');
    await loadCurrentCompanyAndRoute(false);
  } catch (err) {
    console.error('Set password error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function handleChangePasswordSubmit(e) {
  return submitPasswordChange(e, 'change-password-new', 'change-password-confirm', 'change-password-form');
}

async function handleSuperChangePasswordSubmit(e) {
  return submitPasswordChange(e, 'super-change-password-new', 'super-change-password-confirm', 'super-change-password-form');
}

async function submitPasswordChange(e, newFieldId, confirmFieldId, formId) {
  e.preventDefault();
  const password = document.getElementById(newFieldId).value;
  const confirmPassword = document.getElementById(confirmFieldId).value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    document.getElementById(formId).reset();
    showToast('✅ Password updated', 'success');
  } catch (err) {
    console.error('Change password error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== INVITES =====
async function callEdgeFunction(functionName, payload) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('You must be logged in to do that');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

async function callInviteFunction(payload) {
  return callEdgeFunction('invite-member', payload);
}

// Like callEdgeFunction, but for Edge Functions meant to be called by an
// unauthenticated caller (e.g. a contractor who just asked a question with
// no login) — no session/Authorization header is required or sent.
async function callPublicEdgeFunction(functionName, payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

// Emails each contractor their unique RFQ link via the send-rfq-invites
// Edge Function (Resend). Best-effort: a failure here doesn't undo the RFQ
// or its invitation rows — the links are still shown/copyable as a fallback.
async function sendRFQInviteEmails(rfqId, invitations) {
  const payload = {
    rfqId,
    invitations: invitations.map(inv => ({ email: inv.contractor_email, token: inv.invitation_token }))
  };

  try {
    const result = await callEdgeFunction('send-rfq-invites', payload);
    showToast(`✅ Emailed ${result.sent || invitations.length} contractor(s)`, 'success');
  } catch (err) {
    console.error('Error sending contractor emails:', err);
    showToast('RFQ created, but emailing contractors failed: ' + err.message, 'warning');
  }
}

// Fires automatically right after a new Open (public) RFQ is created —
// emails every registered supplier whose notification province matches
// this RFQ's province (or who chose "All Provinces"). Best-effort, same
// as sendRFQInviteEmails: a failure here doesn't undo the RFQ itself, it
// just means suppliers won't have been proactively emailed — the RFQ is
// still live and browsable on the public portal either way.
async function notifySuppliersNewRFQ(rfqId) {
  try {
    const result = await callEdgeFunction('notify-suppliers-new-rfq', { rfqId });
    if (result.sent > 0) {
      showToast(`✅ Notified ${result.sent} registered supplier(s) in this province`, 'success');
    }
  } catch (err) {
    console.error('Error notifying suppliers:', err);
    showToast('RFQ created, but notifying suppliers failed: ' + err.message, 'warning');
  }
}

async function handleInviteCompanySubmit(e) {
  e.preventDefault();
  const companyName = document.getElementById('invite-company-name').value.trim();
  const email = document.getElementById('invite-company-email').value.trim();

  if (!companyName || !email) {
    showToast('Please fill in both fields', 'error');
    return;
  }

  try {
    showToast('Sending invite...', 'info');
    await callInviteFunction({ companyName, email });
    showToast(`✅ Invited ${email} to set up "${companyName}"`, 'success');
    document.getElementById('invite-company-form').reset();
    loadSuperAdminCompanies();
  } catch (err) {
    console.error('Invite company error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function handleInviteTeammateSubmit(e) {
  e.preventDefault();
  if (!currentCompany) return;
  const email = document.getElementById('invite-teammate-email').value.trim();

  if (!email) {
    showToast('Please enter an email', 'error');
    return;
  }

  try {
    showToast('Sending invite...', 'info');
    await callInviteFunction({ companyId: currentCompany.id, email, role: 'staff' });
    showToast(`✅ Invited ${email} to your team`, 'success');
    document.getElementById('invite-teammate-form').reset();
    loadTeamMembers();
  } catch (err) {
    console.error('Invite teammate error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function loadTeamMembers() {
  if (!currentCompany) return;
  try {
    const { data: members, error: membersError } = await client
      .from('company_members')
      .select('id, role, email, user_id')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: true });

    if (membersError) throw membersError;

    const { data: invites } = await client
      .from('company_invitations')
      .select('id, email, created_at')
      .eq('company_id', currentCompany.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    let html = '';

    if (members && members.length > 0) {
      html += members.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid var(--border); border-radius:4px; margin-bottom:8px;">
          <span>${m.email || m.user_id}${currentUser && m.user_id === currentUser.id ? ' <span style="color:var(--border); font-size:12px;">(you)</span>' : ''}</span>
          <span class="submission-status approved" style="text-transform:capitalize;">${m.role}</span>
        </div>
      `).join('');
    } else {
      html += '<p style="color:var(--border); font-style:italic;">No team members found.</p>';
    }

    if (invites && invites.length > 0) {
      html += '<h4 style="margin-top:20px; margin-bottom:10px; font-size:12px; text-transform:uppercase; color:var(--border);">Pending Invites</h4>';
      html += invites.map(inv => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px dashed var(--border); border-radius:4px; margin-bottom:8px;">
          <span>${inv.email}</span>
          <span style="font-size:12px; color:var(--border);">Invited ${new Date(inv.created_at).toLocaleDateString()}</span>
        </div>
      `).join('');
    }

    document.getElementById('team-members-list').innerHTML = html;
  } catch (err) {
    console.error('Error loading team:', err);
    const el = document.getElementById('team-members-list');
    if (el) el.innerHTML = '<p style="color:var(--warning);">Error loading team.</p>';
  }
}

async function loadCurrentCompanyAndRoute(wantsAdmin) {
  try {
    // Check super-admin status first — a super-admin should be able to log in
    // and reach Platform Admin even if they don't belong to any company.
    const { data: adminCheck } = await client
      .from('super_admins')
      .select('email')
      .eq('email', currentUser.email)
      .maybeSingle();
    isSuperAdmin = !!adminCheck;

    const { data: membership, error } = await client
      .from('company_members')
      .select('company_id, role, companies(*)')
      .eq('user_id', currentUser.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error loading company membership:', error);
    }

    currentCompany = (membership && membership.companies) ? membership.companies : null;

    if (currentCompany && currentCompany.status === 'suspended') {
      showToast('This account has been suspended. Contact the platform admin.', 'error');
      await client.auth.signOut();
      currentCompany = null;
      applyDefaultBranding();
      showLandingView();
      return;
    }

    if (!currentCompany && !isSuperAdmin) {
      showToast('Could not find a company for this account', 'error');
      await client.auth.signOut();
      applyDefaultBranding();
      showLandingView();
      return;
    }

    if ((wantsAdmin || !currentCompany) && isSuperAdmin) {
      showSuperAdminView();
    } else {
      showAdminView();
    }
  } catch (err) {
    console.error('Error routing after login:', err);
    showToast('Error loading account: ' + err.message, 'error');
  }
}

async function logoutAdmin() {
  await client.auth.signOut();
  currentUser = null;
  currentCompany = null;
  isSuperAdmin = false;
  window.location.href = window.location.pathname;
}

// ===== CONTRACTOR VIEW =====
async function loadContractorView(token) {
  try {
    console.log('Loading contractor view for token:', token);

    hideAllTopLevelViews();
    document.getElementById('public-view').style.display = 'block';
    hideAllPublicSections();

    const { data: invitation, error: invError } = await client
      .from('rfq_invitations')
      .select('*')
      .eq('invitation_token', token)
      .single();

    if (invError || !invitation) {
      console.error('Invitation not found');
      document.getElementById('no-rfq-message').style.display = 'block';
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').innerHTML = '<div class="card"><h2>Invalid Link</h2><p>This RFQ link is invalid or has expired.</p></div>';
      return;
    }

    currentRFQId = invitation.rfq_id;
    console.log('✅ Invitation found for RFQ:', currentRFQId);

    await loadRFQDetails(currentRFQId);
    document.getElementById('rfq-portal').style.display = 'block';
    document.getElementById('no-rfq-message').style.display = 'none';

  } catch (err) {
    console.error('Error loading contractor view:', err);
  }
}

// Public "respond to an information request" page, reached via the emailed
// ?info=TOKEN link. Uses the get_submission_by_info_token/submit_additional_info
// RPCs (SECURITY DEFINER) since the contractor isn't logged in and RLS
// otherwise blocks reading/updating someone else's submission — the token
// itself is the credential, same trust model as the existing rfq_invitations
// invite-link tokens.
let currentInfoRequestToken = null;
let currentInfoRequestSubmissionId = null;
let currentInfoRequestRfqId = null;

// Public "update my notification preferences" page, reached via the
// ?prefs=TOKEN link included in every new-RFQ notification email. Uses
// get_applicant_preferences/update_applicant_province (SECURITY DEFINER)
// since the supplier isn't logged in — the token is the credential, same
// trust model as the info-request/invite-link tokens above.
let currentPrefsToken = null;

async function loadInfoRequestView(token) {
  try {
    hideAllTopLevelViews();
    document.getElementById('public-view').style.display = 'block';
    hideAllPublicSections();

    const { data, error } = await client.rpc('get_submission_by_info_token', { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row) {
      console.error('Info request link not found:', error);
      document.getElementById('no-rfq-message').style.display = 'block';
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').innerHTML = '<div class="card"><h2>Invalid Link</h2><p>This link is invalid or has already been used.</p></div>';
      return;
    }

    currentInfoRequestToken = token;
    currentInfoRequestSubmissionId = row.submission_id;
    currentInfoRequestRfqId = row.rfq_id;

    if (row.company_id) {
      const { data: company } = await client
        .from('companies')
        .select('*')
        .eq('id', row.company_id)
        .maybeSingle();
      if (company) {
        applyCompanyBranding(company, {
          subtitle: 'Request for Quotation Portal',
          heroTitle: company.name,
          heroSubtitle: `${company.name} has asked for more information on your submission.`
        });
      } else {
        applyDefaultBranding();
      }
    } else {
      applyDefaultBranding();
    }

    const alreadyResponded = !!row.info_response_message;

    const formHtml = `
      <div class="card">
        <h2 style="margin-top:0;">Additional Information Requested</h2>
        <p style="color: var(--border); margin-bottom: 20px;">For your submission to: <strong>${row.rfq_name}</strong> (${row.project_name})</p>

        <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin:0 0 6px 0; font-size:12px; text-transform:uppercase; color:var(--border); font-weight:bold;">They've asked for:</p>
          <p style="margin:0; white-space:pre-wrap;">${row.info_request_message || ''}</p>
        </div>

        ${alreadyResponded ? `
          <div style="background:#E1F0FF; padding:15px; border-radius:4px; margin-bottom:20px;">
            <p style="margin:0 0 6px 0; font-size:12px; text-transform:uppercase; color:var(--border); font-weight:bold;">Your previous response:</p>
            <p style="margin:0; white-space:pre-wrap;">${row.info_response_message}</p>
          </div>
        ` : ''}

        <form id="info-request-form" style="margin-top: 10px;">
          <div style="margin-bottom: 15px;">
            <label>Your Response *</label>
            <textarea id="info-response-message" required rows="4" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:4px; font-family:inherit;" placeholder="Provide the requested information here..."></textarea>
          </div>

          <div style="margin-bottom: 15px;">
            <label>Upload Supporting Document(s)</label>
            <input type="file" id="info-response-files" multiple>
          </div>

          <button type="submit" class="btn gold" style="width: 100%; padding: 15px; margin-top: 10px;">Submit Response</button>
        </form>
      </div>
    `;

    document.getElementById('rfq-portal').innerHTML = formHtml;
    document.getElementById('rfq-portal').style.display = 'block';
    document.getElementById('no-rfq-message').style.display = 'none';

    document.getElementById('info-request-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitAdditionalInfoForm();
    });

  } catch (err) {
    console.error('Error loading info request view:', err);
    showToast('Error loading page', 'error');
  }
}

async function submitAdditionalInfoForm() {
  try {
    const message = document.getElementById('info-response-message').value.trim();
    if (!message) {
      showToast('Please enter a response', 'error');
      return;
    }

    showToast('Submitting...', 'success');

    const { data: submissionId, error } = await client.rpc('submit_additional_info', {
      p_token: currentInfoRequestToken,
      p_message: message
    });

    if (error) throw error;

    const resolvedSubmissionId = submissionId || currentInfoRequestSubmissionId;

    const fileInput = document.getElementById('info-response-files');
    let filesUploaded = 0;
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      for (const file of fileInput.files) {
        try {
          const filePath = `rfq-${currentInfoRequestRfqId}/sub-${resolvedSubmissionId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await client.storage
            .from('rfq-documents')
            .upload(filePath, file);

          if (uploadError) {
            console.warn('⚠️ File upload failed:', uploadError.message);
            continue;
          }

          await client.from('rfq_submission_documents').insert([{
            submission_id: resolvedSubmissionId,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size
          }]);

          filesUploaded++;
        } catch (fileErr) {
          console.warn('⚠️ Error uploading file:', fileErr.message);
        }
      }
    }

    showToast('✅ Response submitted!', 'success');
    setTimeout(() => {
      document.getElementById('rfq-portal').innerHTML = '<div class="card"><h2 style="margin-top:0; color:var(--success);">Thank You!</h2><p>Your response has been received.</p></div>';
    }, 1000);

  } catch (err) {
    console.error('Error submitting response:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

const PROVINCE_OPTIONS = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
];

async function loadSupplierPreferencesView(token) {
  try {
    hideAllTopLevelViews();
    document.getElementById('public-view').style.display = 'block';
    hideAllPublicSections();

    const { data, error } = await client.rpc('get_applicant_preferences', { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row) {
      console.error('Preferences link not found:', error);
      document.getElementById('no-rfq-message').style.display = 'block';
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').innerHTML = '<div class="card"><h2>Invalid Link</h2><p>This link is invalid. Please use the link from your most recent RFQ Hub email.</p></div>';
      return;
    }

    currentPrefsToken = token;

    const optionsHtml = [
      `<option value="ALL"${row.province === 'ALL' ? ' selected' : ''}>All Provinces</option>`,
      ...PROVINCE_OPTIONS.map(p => `<option value="${p}"${row.province === p ? ' selected' : ''}>${p}</option>`)
    ].join('');

    const formHtml = `
      <div class="card" style="max-width:480px; margin:0 auto;">
        <h2 style="margin-top:0;">Notification Preferences</h2>
        <p style="color: var(--border); margin-bottom: 20px;">${escapeHtmlClient(row.full_name)} (${escapeHtmlClient(row.email)})</p>

        <form id="prefs-form">
          <div style="margin-bottom: 15px;">
            <label>Notify Me About New Opportunities In</label>
            <select id="prefs-province" required style="width:100%; box-sizing:border-box; padding:10px; border:1px solid var(--border); border-radius:4px; font-family:inherit;">
              ${row.province ? '' : '<option value="" selected disabled>Select a province...</option>'}
              ${optionsHtml}
            </select>
            <p style="margin:6px 0 0 0; font-size:12px; color:var(--border);">Currently: ${row.province ? (row.province === 'ALL' ? 'All Provinces' : escapeHtmlClient(row.province)) : 'not set — you will not receive any RFQ notifications until you choose one.'}</p>
          </div>
          <button type="submit" class="btn gold" style="width: 100%; padding: 12px;">Save Preferences</button>
        </form>
      </div>
    `;

    document.getElementById('rfq-portal').innerHTML = formHtml;
    document.getElementById('rfq-portal').style.display = 'block';
    document.getElementById('no-rfq-message').style.display = 'none';

    document.getElementById('prefs-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitSupplierPreferencesForm();
    });

  } catch (err) {
    console.error('Error loading preferences view:', err);
    showToast('Error loading page', 'error');
  }
}

async function submitSupplierPreferencesForm() {
  try {
    const province = document.getElementById('prefs-province').value;
    if (!province) {
      showToast('Please select a province', 'error');
      return;
    }

    const { error } = await client.rpc('update_applicant_province', {
      p_token: currentPrefsToken,
      p_province: province
    });

    if (error) throw error;

    showToast('✅ Preferences saved', 'success');
  } catch (err) {
    console.error('Error saving preferences:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// Small standalone HTML-escaper for the preferences page (mirrors the
// inline escaping style used elsewhere in this file for user-supplied text).
function escapeHtmlClient(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadOpenRFQView(rfqId) {
  try {
    console.log('Loading open RFQ view:', rfqId);

    hideAllTopLevelViews();
    document.getElementById('public-view').style.display = 'block';
    hideAllPublicSections();

    currentRFQId = rfqId;
    await loadRFQDetails(rfqId, true);
    document.getElementById('rfq-portal').style.display = 'block';
    document.getElementById('no-rfq-message').style.display = 'none';

  } catch (err) {
    console.error('Error loading open RFQ view:', err);
  }
}

async function loadRFQDetails(rfqId, isOpenAccess = false) {
  try {
    const { data: rfq, error } = await client
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single();

    if (error || !rfq) {
      throw new Error('RFQ not found');
    }

    currentRFQData = rfq;

    // Direct public-portal access must be to an RFQ the company actually
    // marked "Open" — a closed RFQ is only reachable via its invite link,
    // even if someone guesses/shares its id.
    if (isOpenAccess && !rfq.is_public) {
      document.getElementById('rfq-portal').innerHTML = '<div class="card"><h2 style="margin-top:0;">Not Available</h2><p>This RFQ is invite-only and can\'t be accessed from the public portal.</p></div>';
      document.getElementById('rfq-portal').style.display = 'block';
      applyDefaultBranding();
      return;
    }

    console.log('RFQ loaded:', rfq.rfq_name);

    let company = null;
    if (rfq.company_id) {
      const { data: companyData } = await client
        .from('companies')
        .select('*')
        .eq('id', rfq.company_id)
        .maybeSingle();
      company = companyData || null;
    }

    if (company) {
      applyCompanyBranding(company, {
        subtitle: 'Request for Quotation Portal',
        heroTitle: company.name,
        heroSubtitle: isOpenAccess
          ? `${company.name} is accepting quotations for this RFQ.`
          : `You've been invited to submit a quotation to ${company.name}.`
      });
    } else {
      applyDefaultBranding();
    }

    // Suspended/removed suppliers can still view this RFQ (per Brent's
    // explicit instruction) but can't apply — this only drives the UI
    // (banner + disabled button); the real enforcement is the DB-level
    // rfq_submissions insert policy, which blocks it regardless of this.
    const isApplicationBlocked = !!(currentApplicantStatus && (currentApplicantStatus.status === 'suspended' || currentApplicantStatus.status === 'removed'));

    // Build contractor form
    let formHtml = `
      <div class="card">
        <h2 style="margin-top:0;">${rfq.rfq_name}</h2>
        <p style="color: var(--border); margin-bottom: 20px;">${rfq.description}</p>

        ${(rfq.location_area || rfq.province) ? `<p><strong>Location:</strong> ${[rfq.location_area, rfq.province].filter(Boolean).join(', ')}</p>` : ''}
        ${rfq.budget ? `<p><strong>Budget:</strong> R${rfq.budget.toLocaleString()}</p>` : ''}
        ${rfq.deadline ? `<p><strong>Deadline:</strong> ${new Date(rfq.deadline).toLocaleDateString()}</p>` : ''}

        ${rfq.required_documents && rfq.required_documents.length > 0 ? `
          <div style="margin: 20px 0;">
            <h4>Required Documents:</h4>
            <ul>
              ${rfq.required_documents.map(doc => `<li>${escapeHtmlClient(doc.name)}${doc.mandatory ? ' <strong style="color:var(--accent);">(Mandatory)</strong>' : ''}${doc.requires_expiry ? ' <span style="color:var(--border); font-size:12px;">— expiry date required</span>' : ''}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${rfq.attachments && rfq.attachments.length > 0 ? `
          <div style="margin: 20px 0; padding: 15px; background: var(--bg-2); border-radius: 4px;">
            <h4 style="margin-top:0;">RFQ Documents</h4>
            <p style="color: var(--border); font-size: 14px; margin-bottom: 10px;">Please review before applying:</p>
            <ul style="margin:0; padding-left:20px;">
              ${rfq.attachments.map(att => `<li style="margin-bottom:6px;"><a href="${att.url}" target="_blank" rel="noopener noreferrer">${att.name}</a></li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div style="margin: 20px 0; padding: 15px; background: var(--bg-2); border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <h4 style="margin:0;">Questions &amp; Answers</h4>
            <button type="button" class="btn secondary" style="padding:8px 14px;" onclick="openAskQuestionModal('${rfq.id}', '${escapeHtmlClient(rfq.rfq_name).replace(/'/g, "\\'")}')">❓ Ask a Question</button>
          </div>
          <div id="rfq-qa-list" style="margin-top:12px;"><p style="color: var(--border); font-size: 13px; margin:0;">Loading...</p></div>
        </div>

        ${currentApplicantStatus && (currentApplicantStatus.status === 'suspended' || currentApplicantStatus.status === 'removed') ? `
          <div style="margin: 20px 0; padding: 15px; background:#FDECEA; border:1px solid #D32F2F; border-radius:4px;">
            <p style="margin:0; font-weight:600; color:#D32F2F;">⚠️ Your supplier registration has been ${currentApplicantStatus.status === 'suspended' ? 'suspended' : 'removed'}.</p>
            <p style="margin:6px 0 0 0; font-size:13px; color:var(--ink);">You can still view this RFQ, but you can't submit an application. ${currentApplicantStatus.status_reason ? 'Reason: ' + escapeHtmlClient(currentApplicantStatus.status_reason) + '.' : ''} Please contact us if you believe this is a mistake.</p>
          </div>
        ` : ''}

        <form id="contractor-form" style="margin-top: 30px;">
          <h3>Your Company Information</h3>

          <div style="margin-bottom: 15px;">
            <label>Company Name *</label>
            <input type="text" id="contractor-name" required style="width:100%;">
          </div>

          <div style="margin-bottom: 15px;">
            <label>Email Address *</label>
            <input type="email" id="contractor-email" required style="width:100%;">
          </div>

          <div style="margin-bottom: 15px;">
            <label>Phone Number</label>
            <input type="tel" id="contractor-phone" style="width:100%;">
          </div>

          <div style="margin-bottom: 15px;">
            <label>Company Registration Number</label>
            <input type="text" id="contractor-reg" style="width:100%;">
          </div>

          <div style="margin-top: 30px;">
            <h4>Upload Documents</h4>
            <p style="color: var(--border); font-size: 14px;">Documents marked * are mandatory and must be uploaded to submit.</p>
            ${rfq.required_documents.map((doc, idx) => `
              <div style="margin-bottom: 15px;">
                <label>${escapeHtmlClient(doc.name)}${doc.mandatory ? ' *' : ''}</label>
                <input type="file" id="doc-${idx}" data-doc-name="${escapeHtmlClient(doc.name)}" accept=".pdf,.doc,.docx,.xls,.xlsx"${doc.mandatory ? ' required' : ''}>
                ${doc.requires_expiry ? `
                  <div style="margin-top:6px;">
                    <label style="font-size:13px; font-weight:normal;">Expiry Date for ${escapeHtmlClient(doc.name)} *</label>
                    <input type="date" id="doc-expiry-${idx}" required style="padding:8px; border:1px solid var(--border); border-radius:4px;">
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <button type="submit" class="btn gold" id="contractor-submit-btn" style="width: 100%; padding: 15px; margin-top: 20px;"${isApplicationBlocked ? ' disabled' : ''}>${isApplicationBlocked ? 'Application Unavailable' : 'Submit Application'}</button>
        </form>
      </div>
    `;

    document.getElementById('rfq-portal').innerHTML = formHtml;

    document.getElementById('contractor-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (isApplicationBlocked) {
        showToast('❌ Your supplier registration doesn\'t allow applying to RFQs right now.', 'error');
        return;
      }
      const token = new URLSearchParams(window.location.search).get('rfq');
      submitContractorForm(token);
    });

    loadPublicQA(rfq.id);

  } catch (err) {
    console.error('Error loading RFQ details:', err);
    showToast('Error loading RFQ', 'error');
  }
}

// Renders only questions the owning company chose to answer publicly —
// get_public_rfq_questions() is a SECURITY DEFINER RPC that deliberately
// excludes applicant_email/applicant_name so the asker stays anonymous to
// other contractors viewing this page.
async function loadPublicQA(rfqId) {
  const listEl = document.getElementById('rfq-qa-list');
  if (!listEl) return;

  try {
    const { data: qa, error } = await client.rpc('get_public_rfq_questions', { p_rfq_id: rfqId });
    if (error) throw error;

    if (!qa || qa.length === 0) {
      listEl.innerHTML = '<p style="color: var(--border); font-size: 13px; margin:0;">No published questions yet. Be the first to ask.</p>';
      return;
    }

    listEl.innerHTML = qa.map(item => `
      <div style="background:white; border:1px solid var(--border); border-radius:4px; padding:12px; margin-bottom:10px;">
        <p style="margin:0 0 6px 0; font-weight:bold; color:var(--ink);">Q: ${escapeHtmlClient(item.question)}</p>
        <p style="margin:0; color:var(--ink); white-space:pre-wrap;">A: ${escapeHtmlClient(item.answer)}</p>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading public Q&A:', err);
    listEl.innerHTML = '<p style="color: var(--border); font-size: 13px; margin:0;">Could not load questions right now.</p>';
  }
}

async function submitContractorForm(token) {
  try {
    const name = document.getElementById('contractor-name').value.trim();
    const email = document.getElementById('contractor-email').value.trim();
    const phone = document.getElementById('contractor-phone').value.trim();
    const reg = document.getElementById('contractor-reg').value.trim();

    if (!name || !email) {
      showToast('Please fill in required fields', 'error');
      return;
    }

    showToast('Submitting...', 'success');

    // Generate the submission id client-side so we don't need to read the row
    // back after insert (contractors are unauthenticated, and submissions are
    // only readable by the owning company under RLS).
    const submissionId = generateUUID();

    const { error: subError } = await client
      .from('rfq_submissions')
      .insert([{
        id: submissionId,
        rfq_id: currentRFQId,
        contractor_name: name,
        contractor_email: email,
        contractor_phone: phone,
        contractor_reg: reg,
        status: 'submitted'
      }]);

    if (subError) throw subError;

    console.log('✅ Submission created:', submissionId);

    // Upload files. Non-mandatory documents are optional, so a failed/missing
    // upload here doesn't abort the whole submission — mandatory documents
    // and required expiry dates are already enforced by the form's own
    // `required` attributes before this handler ever runs (native HTML5
    // validation blocks the submit event otherwise).
    const fileInputs = document.querySelectorAll('input[type="file"][id^="doc-"]');
    let filesUploaded = 0;

    for (let input of fileInputs) {
      if (input.files[0]) {
        try {
          const file = input.files[0];
          const filePath = `rfq-${currentRFQId}/sub-${submissionId}/${Date.now()}-${file.name}`;

          const { error: uploadError } = await client.storage
            .from('rfq-documents')
            .upload(filePath, file);

          if (uploadError) {
            console.warn('⚠️ File upload failed:', uploadError.message);
            continue;
          }

          // Pair this upload back to its required-document entry (name +
          // whether an expiry date was collected for it) using the same
          // index the form was rendered with.
          const idx = input.id.replace('doc-', '');
          const docMeta = (currentRFQData && currentRFQData.required_documents && currentRFQData.required_documents[idx]) || null;
          const expiryInput = docMeta && docMeta.requires_expiry ? document.getElementById(`doc-expiry-${idx}`) : null;

          await client.from('rfq_submission_documents').insert([{
            submission_id: submissionId,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            document_type: docMeta ? docMeta.name : null,
            expiry_date: (expiryInput && expiryInput.value) ? expiryInput.value : null
          }]);

          filesUploaded++;
        } catch (fileErr) {
          console.warn('⚠️ Error uploading file:', fileErr.message);
        }
      }
    }

    // Mark token as used (only applies to invite-link applications; direct
    // public-portal applications have no invitation token to update).
    if (token) {
      await client
        .from('rfq_invitations')
        .update({ used: true })
        .eq('invitation_token', token);

      console.log('✅ Token marked as used');
    }

    showToast('✅ Submission successful!', 'success');
    setTimeout(() => {
      document.getElementById('rfq-portal').innerHTML = '<div class="card"><h2 style="margin-top:0; color:var(--success);">Thank You!</h2><p>Your submission has been received.</p></div>';
    }, 1000);

  } catch (err) {
    console.error('Error submitting:', err);
    // A suspended/removed supplier's insert is rejected at the DB level
    // (rfq_submissions' insert RLS policy) — this is the real enforcement,
    // the disabled Submit button above is just a heads-up. Surface that
    // specific case with a clear message instead of the raw Postgres
    // "row violates row-level security policy" text.
    if (err && err.code === '42501') {
      showToast('❌ Your supplier registration doesn\'t allow applying to RFQs right now. Please contact us for details.', 'error');
    } else {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

// Shows the company's logo next to its name in the dashboard header bar
// (distinct from the site-wide masthead logo) so the page feels like it
// belongs to that company. Hides the <img> entirely when there's no logo.
function updateAdminHeaderLogo(company) {
  const img = document.getElementById('admin-header-logo');
  if (!img) return;
  if (company && company.logo_url) {
    img.src = company.logo_url;
    img.alt = company.name || '';
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
    img.src = '';
  }
}

// ===== ADMIN VIEW (Company Dashboard) =====
function showAdminView() {
  hideAllTopLevelViews();
  document.getElementById('admin-view').style.display = 'block';

  document.getElementById('admin-company-name').textContent = currentCompany ? currentCompany.name : 'RFQ Management';
  updateAdminHeaderLogo(currentCompany);
  applyCompanyBranding(currentCompany, {
    heroTitle: currentCompany ? currentCompany.name : 'RFQ Hub',
    heroSubtitle: 'Manage your RFQs, contractor invitations, and submissions.'
  });

  const superLink = document.getElementById('super-admin-link');
  if (superLink) superLink.style.display = isSuperAdmin ? 'inline' : 'none';

  document.getElementById('create-tab').style.display = 'block';
  document.getElementById('console-tab').style.display = 'none';
  document.getElementById('submissions-tab').style.display = 'none';
  document.getElementById('team-tab').style.display = 'none';
  document.getElementById('settings-tab').style.display = 'none';

  document.querySelectorAll('.company-tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });
}

function switchAdminTab(tabName, button) {
  document.querySelectorAll('.admin-tab').forEach(tab => tab.style.display = 'none');
  document.querySelectorAll('.company-tab-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabName + '-tab').style.display = 'block';
  if (button) button.classList.add('active');

  if (tabName === 'console') {
    loadRFQConsole();
  } else if (tabName === 'submissions') {
    loadSubmissions();
  } else if (tabName === 'team') {
    loadTeamMembers();
  } else if (tabName === 'settings') {
    loadSettingsTab();
  }
}

// Super Admin dashboard uses its own tab/button classes (.super-tab /
// .super-tab-btn) so switching a tab here never touches the company
// admin dashboard's tab state, and vice versa — the two dashboards can
// be left on different sections without clobbering each other.
function switchSuperAdminTab(tabName, button) {
  document.querySelectorAll('.super-tab').forEach(tab => tab.style.display = 'none');
  document.querySelectorAll('.super-tab-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabName + '-tab').style.display = 'block';
  if (button) button.classList.add('active');
}

// ===== SETTINGS =====
function loadSettingsTab() {
  if (!currentCompany) return;

  document.getElementById('settings-company-name').value = currentCompany.name || '';
  document.getElementById('settings-contact-email').value = currentCompany.contact_email || '';
  document.getElementById('settings-contact-phone').value = currentCompany.contact_phone || '';
  document.getElementById('settings-address').value = currentCompany.address || '';

  const preview = document.getElementById('settings-logo-preview');
  const placeholder = document.getElementById('settings-logo-placeholder');
  const scaleInput = document.getElementById('settings-logo-scale');
  const scaleLabel = document.getElementById('settings-logo-scale-label');

  const scale = currentCompany.logo_scale || 1;
  if (scaleInput) scaleInput.value = Math.round(scale * 100);
  if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;

  if (currentCompany.logo_url) {
    applyLogoScale(preview, scale);
    preview.src = currentCompany.logo_url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

function handleSettingsLogoScaleInput(e) {
  const pct = Number(e.target.value);
  const label = document.getElementById('settings-logo-scale-label');
  if (label) label.textContent = `${pct}%`;
  const preview = document.getElementById('settings-logo-preview');
  if (preview && preview.style.display !== 'none') {
    applyLogoScale(preview, pct / 100);
  }
}

async function handleSettingsLogoScaleChange(e) {
  if (!currentCompany) return;
  const pct = Number(e.target.value);
  const scale = Math.min(1.5, Math.max(0.5, pct / 100));
  try {
    const { error } = await client
      .from('companies')
      .update({ logo_scale: scale, updated_at: new Date().toISOString() })
      .eq('id', currentCompany.id);
    if (error) throw error;

    currentCompany.logo_scale = scale;

    // Live-update the real header logo too, without disturbing the
    // title/subtitle text currently shown there.
    const brandImg = document.getElementById('brand-logo-img');
    if (brandImg && brandImg.style.display !== 'none') {
      applyLogoScale(brandImg, scale);
    }

    showToast('✅ Logo size saved', 'success');
  } catch (err) {
    console.error('Error saving logo size:', err);
    showToast('❌ Error saving logo size: ' + err.message, 'error');
  }
}

async function handleLogoFileChange(e) {
  const file = e.target.files[0];
  if (!file || !currentCompany) return;

  try {
    showToast('Uploading logo...', 'info');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${currentCompany.id}/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('company-logos')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage.from('company-logos').getPublicUrl(path);
    const logoUrl = urlData.publicUrl;

    const { error: updateError } = await client
      .from('companies')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', currentCompany.id);
    if (updateError) throw updateError;

    currentCompany.logo_url = logoUrl;
    loadSettingsTab();
    document.getElementById('admin-company-name').textContent = currentCompany.name;
    updateAdminHeaderLogo(currentCompany);
    applyCompanyBranding(currentCompany, {
      heroTitle: currentCompany.name,
      heroSubtitle: 'Manage your RFQs, contractor invitations, and submissions.'
    });

    showToast('✅ Logo updated!', 'success');
  } catch (err) {
    console.error('Logo upload error:', err);
    showToast('Error uploading logo: ' + err.message, 'error');
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  if (!currentCompany) return;

  const name = document.getElementById('settings-company-name').value.trim();
  const contactEmail = document.getElementById('settings-contact-email').value.trim();
  const contactPhone = document.getElementById('settings-contact-phone').value.trim();
  const address = document.getElementById('settings-address').value.trim();

  if (!name) {
    showToast('Company name is required', 'error');
    return;
  }

  try {
    const { error } = await client
      .from('companies')
      .update({
        name,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        address: address || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentCompany.id);
    if (error) throw error;

    currentCompany.name = name;
    currentCompany.contact_email = contactEmail;
    currentCompany.contact_phone = contactPhone;
    currentCompany.address = address;

    document.getElementById('admin-company-name').textContent = name;
    updateAdminHeaderLogo(currentCompany);
    applyCompanyBranding(currentCompany, {
      heroTitle: name,
      heroSubtitle: 'Manage your RFQs, contractor invitations, and submissions.'
    });

    showToast('✅ Settings saved!', 'success');
  } catch (err) {
    console.error('Error saving settings:', err);
    showToast('Error saving settings: ' + err.message, 'error');
  }
}

// ===== CREATE RFQ =====
function setupCreateRFQForm() {
  const form = document.getElementById('create-rfq-form');
  if (form) {
    form.addEventListener('submit', createNewRFQ);
    console.log('✅ Create RFQ form found and hooked up');
  }

  document.querySelectorAll('input[name="rfq_visibility"]').forEach(radio => {
    radio.addEventListener('change', updateVisibilityHint);
  });
  updateVisibilityHint();
}

function updateVisibilityHint() {
  const checked = document.querySelector('input[name="rfq_visibility"]:checked');
  const isPublic = checked && checked.value === 'open';
  const label = document.getElementById('contractor-emails-label');
  const hint = document.getElementById('contractor-emails-hint');
  if (!label || !hint) return;

  if (isPublic) {
    label.textContent = 'Contractor Email Addresses (optional)';
    hint.textContent = "Optional for Open RFQs — anyone can find and apply via the public portal. Add emails here only if you also want to invite specific contractors directly.";
  } else {
    label.textContent = 'Contractor Email Addresses *';
    hint.textContent = 'Enter email addresses (one per line). Each gets a direct invite link and email. Required for Closed RFQs.';
  }
}

function addDocumentField() {
  const builder = document.getElementById('required-docs-builder');
  const field = document.createElement('div');
  field.className = 'doc-row';
  field.style.cssText = 'border:1px solid var(--border); border-radius:6px; padding:10px; margin-bottom:10px;';
  field.innerHTML = `
    <div style="display:flex; gap:10px; margin-bottom:8px;">
      <input type="text" class="doc-field" placeholder="e.g., Insurance Certificate" style="flex:1; padding:8px; border:1px solid var(--border); border-radius:4px;">
      <button type="button" onclick="this.closest('.doc-row').remove()" class="btn secondary" style="padding:8px 12px;">Remove</button>
    </div>
    <div style="display:flex; gap:20px; flex-wrap:wrap; font-size:13px; color:var(--ink);">
      <label style="display:flex; align-items:center; gap:6px; font-weight:normal; cursor:pointer;">
        <input type="checkbox" class="doc-mandatory-field"> Mandatory for submission
      </label>
      <label style="display:flex; align-items:center; gap:6px; font-weight:normal; cursor:pointer;">
        <input type="checkbox" class="doc-expiry-field"> Requires an expiry date (e.g. COIDA, insurance)
      </label>
    </div>
  `;
  builder.appendChild(field);
}

function resetCreateForm() {
  document.getElementById('create-rfq-form').reset();
  document.getElementById('required-docs-builder').innerHTML = '';
}

async function createNewRFQ() {
  if (isSubmittingRFQ) {
    console.log('⏳ Already submitting, please wait...');
    return;
  }

  if (!currentCompany) {
    showToast('❌ No company account loaded', 'error');
    return;
  }

  isSubmittingRFQ = true;

  try {
    console.log('=== CREATE RFQ STARTED ===');

    const nameInput = document.querySelector('input[name="rfq_name"]');
    const projectInput = document.querySelector('input[name="rfq_project"]');
    const descInput = document.querySelector('textarea[name="rfq_description"]');
    const deadlineInput = document.querySelector('input[name="rfq_deadline"]');
    const budgetInput = document.querySelector('input[name="rfq_budget"]');
    const emailInput = document.querySelector('textarea[name="contractor_emails"]');
    const visibilityInput = document.querySelector('input[name="rfq_visibility"]:checked');
    const provinceInput = document.querySelector('select[name="rfq_province"]');
    const locationAreaInput = document.querySelector('input[name="rfq_location_area"]');

    const name = nameInput?.value?.trim() || '';
    const project = projectInput?.value?.trim() || '';
    const description = descInput?.value?.trim() || '';
    const deadline = deadlineInput?.value?.trim() || '';
    const budget = budgetInput?.value?.trim() || '';
    const emailsText = emailInput?.value?.trim() || '';
    const isPublic = (visibilityInput?.value || 'closed') === 'open';
    const province = provinceInput?.value || '';
    const locationArea = locationAreaInput?.value?.trim() || '';

    const contractorEmails = emailsText
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.length > 0);

    const docRows = document.querySelectorAll('#required-docs-builder .doc-row');
    const requiredDocs = Array.from(docRows)
      .map(row => {
        const nameInput = row.querySelector('.doc-field');
        const name = nameInput && nameInput.value ? nameInput.value.trim() : '';
        if (!name) return null;
        const mandatoryInput = row.querySelector('.doc-mandatory-field');
        const expiryInput = row.querySelector('.doc-expiry-field');
        return {
          name,
          mandatory: !!(mandatoryInput && mandatoryInput.checked),
          requires_expiry: !!(expiryInput && expiryInput.checked)
        };
      })
      .filter(Boolean);

    if (!name) {
      showToast('❌ Please enter RFQ Name', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (!project) {
      showToast('❌ Please enter Project Name', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (!description) {
      showToast('❌ Please enter Description', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (!deadline) {
      showToast('❌ Please select a Deadline', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (!province) {
      showToast('❌ Please select a Province', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (requiredDocs.length === 0) {
      showToast('❌ Please add at least one Required Document type', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (!isPublic && contractorEmails.length === 0) {
      showToast('❌ Please enter at least one Contractor Email (required for Closed RFQs)', 'error');
      isSubmittingRFQ = false;
      return;
    }

    console.log('✅ All validations passed');
    showToast('Creating RFQ...', 'success');

    const { data: rfq, error: rfqError } = await client
      .from('rfqs')
      .insert([{
        rfq_name: name,
        project_name: project,
        description: description,
        deadline: deadline,
        budget: budget || null,
        required_documents: requiredDocs,
        created_by: currentUser ? currentUser.email : 'unknown',
        company_id: currentCompany.id,
        is_public: isPublic,
        province: province,
        location_area: locationArea || null
      }])
      .select()
      .single();

    if (rfqError || !rfq || !rfq.id) {
      throw new Error(rfqError ? rfqError.message : 'Failed to create RFQ');
    }

    console.log('✅ RFQ created:', rfq.id);

    await uploadRFQAttachments(rfq.id);

    if (isPublic) {
      // Fire-and-forget: don't block the rest of RFQ creation on this.
      notifySuppliersNewRFQ(rfq.id);
    }

    if (contractorEmails.length > 0) {
      const invitations = contractorEmails.map(email => ({
        rfq_id: rfq.id,
        contractor_email: email,
        invitation_token: generateToken(),
        used: false
      }));

      const { error: invError } = await client
        .from('rfq_invitations')
        .insert(invitations);

      if (invError) throw invError;

      console.log('✅ Invitations created');

      window.lastInvitations = invitations;
      await sendRFQInviteEmails(rfq.id, invitations);
      showGeneratedLinks(rfq.id, invitations);
    } else {
      showToast(isPublic ? '✅ RFQ created and listed on the public portal' : '✅ RFQ created', 'success');
    }

    resetCreateForm();

  } catch (err) {
    console.error('❌ Error creating RFQ:', err);
    showToast('Error: ' + err.message, 'error');
  } finally {
    isSubmittingRFQ = false;
  }
}

// Uploads any files picked in the "Attach RFQ Document(s)" input to the
// public rfq-attachments bucket and records them on the rfq row so the
// contractor portal can show download links. Best-effort: a failed file
// doesn't stop the RFQ from being created.
async function uploadRFQAttachments(rfqId) {
  const input = document.getElementById('rfq-attachments-input');
  const files = input && input.files ? Array.from(input.files) : [];
  if (files.length === 0) return;

  const uploaded = [];

  for (const file of files) {
    try {
      const path = `rfq-${rfqId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await client.storage
        .from('rfq-attachments')
        .upload(path, file);

      if (uploadError) {
        console.warn('⚠️ Attachment upload failed:', file.name, uploadError.message);
        continue;
      }

      const { data: urlData } = client.storage.from('rfq-attachments').getPublicUrl(path);
      uploaded.push({ name: file.name, url: urlData.publicUrl });
    } catch (err) {
      console.warn('⚠️ Attachment upload error:', file.name, err.message);
    }
  }

  if (uploaded.length === 0) return;

  const { error: updateError } = await client
    .from('rfqs')
    .update({ attachments: uploaded })
    .eq('id', rfqId);

  if (updateError) {
    console.error('Error saving attachment list:', updateError);
    showToast('RFQ created, but attaching documents failed', 'warning');
  }
}

// ===== RFQ CONSOLE =====
async function loadRFQConsole() {
  try {
    if (!currentCompany) return;
    console.log('Loading RFQ Console...');

    const { data: rfqs, error: rfqError } = await client
      .from('rfqs')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });

    if (rfqError || !rfqs || rfqs.length === 0) {
      document.getElementById('rfq-console-list').innerHTML =
        '<div style="text-align: center; padding: 40px; color: var(--border);"><p>No active RFQs yet. <strong>Create one to get started!</strong></p></div>';
      return;
    }

    let consoleHtml = '';
    const baseUrl = window.location.origin + window.location.pathname;
    rfqQuestionsById = {};

    for (const rfq of rfqs) {
      const { data: invitations } = await client
        .from('rfq_invitations')
        .select('*')
        .eq('rfq_id', rfq.id);

      const { data: submissions } = await client
        .from('rfq_submissions')
        .select('*')
        .eq('rfq_id', rfq.id);

      const { data: questions } = await client
        .from('rfq_questions')
        .select('*')
        .eq('rfq_id', rfq.id)
        .order('created_at', { ascending: false });

      (questions || []).forEach(q => { rfqQuestionsById[q.id] = q; });
      const pendingQuestionCount = (questions || []).filter(q => q.status === 'pending').length;

      const deadlineDate = new Date(rfq.deadline);
      const isExpired = deadlineDate < new Date();
      const daysLeft = Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24));
      const submissionCount = submissions ? submissions.length : 0;
      const invitationCount = invitations ? invitations.length : 0;
      const responseRate = invitationCount > 0 ? Math.round((submissionCount / invitationCount) * 100) : 0;

      consoleHtml += `
        <div class="rfq-console-card ${isExpired ? 'expired' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
            <div style="flex: 1; min-width: 220px;">
              <h3 style="margin: 0 0 5px 0; color: var(--primary);">
                ${rfq.rfq_name}
                <span class="submission-status ${rfq.is_public ? 'approved' : 'under_review'}" style="vertical-align:middle; margin-left:8px;">${rfq.is_public ? 'Open — Public' : 'Closed — Invite Only'}</span>
              </h3>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: var(--border);">Project: <strong>${rfq.project_name}</strong></p>
              ${(rfq.location_area || rfq.province) ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: var(--border);">📍 ${[rfq.location_area, rfq.province].filter(Boolean).join(', ')}</p>` : ''}
              <p style="margin: 0; font-size: 14px; color: var(--border);">
                Deadline: ${deadlineDate.toLocaleDateString()}
                <span style="color: ${isExpired ? 'var(--warning)' : 'var(--success)'}; font-weight: bold; margin-left: 8px;">
                  ${isExpired ? '❌ Expired' : `📅 ${daysLeft} days left`}
                </span>
              </p>
            </div>
            <div style="text-align: center; background: var(--bg-2); padding: 12px 16px; border-radius: 4px;">
              <p style="margin: 0; font-size: 11px; text-transform: uppercase; color: var(--border); font-weight: bold;">Response Rate</p>
              <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: var(--accent);">${responseRate}%</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: var(--border);">${submissionCount}/${invitationCount} responses</p>
            </div>
          </div>

          <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px;">
            <div style="margin-bottom: 15px;">
              <h4 style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: var(--border); font-weight: bold;">Description</h4>
              <p style="margin: 0; color: var(--ink); line-height: 1.5;">${rfq.description}</p>
            </div>

            ${rfq.budget ? `
              <div style="padding-top: 15px; border-top: 1px solid var(--border); margin-top: 15px;">
                <h4 style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: var(--border); font-weight: bold;">Budget</h4>
                <p style="margin: 0; color: var(--ink); font-size: 18px; font-weight: bold;">R${rfq.budget.toLocaleString()}</p>
              </div>
            ` : ''}
          </div>

          ${rfq.required_documents && rfq.required_documents.length > 0 ? `
            <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px;">
              <h4 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: var(--border); font-weight: bold;">Required Documents</h4>
              <ul style="margin: 0; padding-left: 20px; color: var(--ink);">
                ${rfq.required_documents.map(doc => `<li style="margin-bottom: 5px;">${escapeHtmlClient(doc.name)}${doc.mandatory ? ' <strong style="color:var(--accent);">(Mandatory)</strong>' : ''}${doc.requires_expiry ? ' <span style="color:var(--border); font-size:12px;">— expiry date required</span>' : ''}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${rfq.attachments && rfq.attachments.length > 0 ? `
            <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px;">
              <h4 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: var(--border); font-weight: bold;">RFQ Documents (visible to contractors)</h4>
              <ul style="margin: 0; padding-left: 20px; color: var(--ink);">
                ${rfq.attachments.map(att => `<li style="margin-bottom: 5px;"><a href="${att.url}" target="_blank" rel="noopener noreferrer">${att.name}</a></li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin-top: 0; margin-bottom: 10px; color: var(--ink);">Contractor Links (${invitationCount})</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${invitations && invitations.length > 0 ? invitations.map((inv, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: white; border: 1px solid var(--border); border-radius: 3px;">
                  <div style="flex: 1; min-width: 0;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: bold; color: var(--ink);">${idx + 1}. ${inv.contractor_email}</p>
                    <code style="font-size: 11px; color: var(--border); display: block; word-break: break-all; font-family: var(--mono);">${baseUrl}?rfq=${inv.invitation_token}</code>
                    <p style="margin: 4px 0 0 0; font-size: 11px; color: var(--border);">${inv.used ? '✅ Submitted' : '⏳ Pending'}</p>
                  </div>
                  <button onclick="copyToClipboard('${baseUrl}?rfq=${inv.invitation_token}')"
                    class="btn" style="margin-left: 10px; padding: 6px 10px; font-size: 12px; white-space: nowrap; flex-shrink: 0;">
                    Copy
                  </button>
                </div>
              `).join('') : '<p style="margin: 0; color: var(--border); font-style: italic;">No invitations sent yet</p>'}
            </div>
          </div>

          <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px; max-height: 320px; overflow-y: auto;">
            <h4 style="margin-top: 0; margin-bottom: 10px; color: var(--ink);">Questions ${pendingQuestionCount > 0 ? `<span class="submission-status info_requested" style="vertical-align:middle; margin-left:6px;">${pendingQuestionCount} pending</span>` : `(${(questions || []).length})`}</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${questions && questions.length > 0 ? questions.map(q => `
                <div style="padding: 10px; background: white; border: 1px solid var(--border); border-radius: 3px;">
                  <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold; color: var(--ink);">${escapeHtmlClient(q.question)}</p>
                  <p style="margin: 0 0 8px 0; font-size: 11px; color: var(--border);">From ${escapeHtmlClient(q.applicant_name || q.applicant_email)} · ${new Date(q.created_at).toLocaleDateString()}</p>
                  ${q.status === 'answered' ? `
                    <div style="background: var(--bg-2); border-radius: 3px; padding: 8px; margin-bottom: 6px;">
                      <p style="margin: 0; font-size: 13px; color: var(--ink); white-space:pre-wrap;">${escapeHtmlClient(q.answer)}</p>
                    </div>
                    <p style="margin: 0; font-size: 11px; color: var(--border);">${q.answer_visibility === 'public' ? '🌐 Posted publicly' : '✉️ Sent privately'} · answered ${q.answered_at ? new Date(q.answered_at).toLocaleDateString() : ''}</p>
                  ` : `
                    <button onclick="openAnswerQuestionModal('${q.id}')" class="btn gold" style="padding: 6px 12px; font-size: 12px;">Reply</button>
                  `}
                </div>
              `).join('') : '<p style="margin: 0; color: var(--border); font-style: italic;">No questions yet</p>'}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button onclick="showAddContractorForm('${rfq.id}')" class="btn secondary" style="padding: 10px;">
              + Add Contractor
            </button>
            <button onclick="copyAllRFQLinks('${rfq.id}')" class="btn gold" style="padding: 10px;">
              Copy All Links
            </button>
          </div>
        </div>
      `;
    }

    document.getElementById('rfq-console-list').innerHTML = consoleHtml;

  } catch (err) {
    console.error('Error in loadRFQConsole:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== SUBMISSIONS =====
async function loadSubmissions() {
  try {
    if (!currentCompany) return;
    console.log('Loading submissions...');

    const { data: allSubmissions, error } = await client
      .from('rfq_submissions')
      .select(`*, rfqs!inner(rfq_name, company_id)`)
      .eq('rfqs.company_id', currentCompany.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('Submissions loaded:', allSubmissions ? allSubmissions.length : 0);

    // Flag any submission that has at least one document whose expiry date
    // had already passed by the time it was submitted, so staff can spot
    // problem submissions from the list without opening every one.
    const submissionIds = (allSubmissions || []).map(s => s.id);
    const expiredSubmissionIds = new Set();
    if (submissionIds.length > 0) {
      const { data: docsWithExpiry } = await client
        .from('rfq_submission_documents')
        .select('submission_id, expiry_date')
        .in('submission_id', submissionIds)
        .not('expiry_date', 'is', null);

      const createdAtById = new Map((allSubmissions || []).map(s => [s.id, s.created_at]));
      (docsWithExpiry || []).forEach(doc => {
        const submittedAt = createdAtById.get(doc.submission_id);
        if (submittedAt && new Date(doc.expiry_date) < new Date(submittedAt)) {
          expiredSubmissionIds.add(doc.submission_id);
        }
      });
    }

    // Populate the RFQ filter's options from the full (unfiltered) set so the
    // dropdown always lists every RFQ that has submissions, regardless of the
    // currently-selected filters — rebuilding it from an already-filtered
    // list would make other RFQs disappear from the dropdown itself.
    const rfqFilterEl = document.getElementById('rfq-filter');
    if (rfqFilterEl) {
      const previousSelection = rfqFilterEl.value;
      const rfqOptionsById = new Map();
      (allSubmissions || []).forEach(sub => {
        if (sub.rfq_id && !rfqOptionsById.has(sub.rfq_id)) {
          rfqOptionsById.set(sub.rfq_id, sub.rfqs ? sub.rfqs.rfq_name : sub.rfq_id);
        }
      });
      rfqFilterEl.innerHTML = '<option value="">All RFQs</option>' +
        Array.from(rfqOptionsById.entries()).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
      rfqFilterEl.value = previousSelection && rfqOptionsById.has(previousSelection) ? previousSelection : '';
    }

    const rfqFilterValue = rfqFilterEl ? rfqFilterEl.value : '';
    const statusFilterValue = document.getElementById('status-filter') ? document.getElementById('status-filter').value : '';

    const submissions = (allSubmissions || []).filter(sub => {
      if (rfqFilterValue && sub.rfq_id !== rfqFilterValue) return false;
      if (statusFilterValue && sub.status !== statusFilterValue) return false;
      return true;
    });

    if (submissions.length === 0) {
      document.getElementById('submissions-list').innerHTML = `<p style="text-align: center; color: var(--border); padding: 40px;">${(allSubmissions || []).length === 0 ? 'No submissions yet' : 'No submissions match this filter'}</p>`;
      return;
    }

    const listHtml = submissions.map(sub => `
      <div class="submission-card" onclick="openSubmissionDetail('${sub.id}')">
        <h3 style="margin: 0 0 10px 0; color: var(--ink);">${sub.contractor_name}${expiredSubmissionIds.has(sub.id) ? ' <span title="Contains a document that was already expired at submission" style="color:var(--closing-today, #D8452B); font-size:14px; font-weight:bold;">🚩 Expired document</span>' : ''}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px; font-size: 14px;">
          <div>
            <p style="margin: 0; color: var(--border);">Email: <strong>${sub.contractor_email}</strong></p>
          </div>
          <div>
            <p style="margin: 0; color: var(--border);">RFQ: <strong>${sub.rfqs.rfq_name}</strong></p>
          </div>
          <div>
            <p style="margin: 0; color: var(--border);">Submitted: ${new Date(sub.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div class="submission-status ${sub.status}">${sub.status}</div>
      </div>
    `).join('');

    document.getElementById('submissions-list').innerHTML = listHtml;

  } catch (err) {
    console.error('Error in loadSubmissions:', err);
    showToast('Error loading submissions: ' + err.message, 'error');
  }
}

async function openSubmissionDetail(id) {
  try {
    const { data: submission } = await client
      .from('rfq_submissions')
      .select('*')
      .eq('id', id)
      .single();

    const { data: rfq } = await client
      .from('rfqs')
      .select('*')
      .eq('id', submission.rfq_id)
      .single();

    const { data: documents } = await client
      .from('rfq_submission_documents')
      .select('*')
      .eq('submission_id', id);

    let detailsHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div>
          <label style="font-weight: bold; font-size: 12px; text-transform: uppercase; color: var(--ink);">Company Name</label>
          <p style="margin: 5px 0; font-size: 16px; color: var(--ink);">${submission.contractor_name}</p>
        </div>
        <div>
          <label style="font-weight: bold; font-size: 12px; text-transform: uppercase; color: var(--ink);">Email</label>
          <p style="margin: 5px 0; font-size: 16px; color: var(--ink);">${submission.contractor_email}</p>
        </div>
        <div>
          <label style="font-weight: bold; font-size: 12px; text-transform: uppercase; color: var(--ink);">Phone</label>
          <p style="margin: 5px 0; font-size: 16px; color: var(--ink);">${submission.contractor_phone}</p>
        </div>
        <div>
          <label style="font-weight: bold; font-size: 12px; text-transform: uppercase; color: var(--ink);">Reg Number</label>
          <p style="margin: 5px 0; font-size: 16px; color: var(--ink);">${submission.contractor_reg}</p>
        </div>
      </div>

      ${rfq ? `
        <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 10px 0; color: var(--ink);">RFQ: ${rfq.rfq_name}</h4>
          <p style="margin: 5px 0; font-size: 14px; color: var(--border);">Project: ${rfq.project_name}</p>
          <p style="margin: 5px 0; font-size: 14px; color: var(--border);">Deadline: ${new Date(rfq.deadline).toLocaleDateString()}</p>
        </div>
      ` : ''}

      <div>
        <label style="font-weight: bold; font-size: 12px; text-transform: uppercase; color: var(--ink);">Submitted</label>
        <p style="margin: 5px 0; font-size: 14px; color: var(--border);">${new Date(submission.created_at).toLocaleString()}</p>
      </div>
    `;

    const docsHtml = documents && documents.length > 0
      ? documents.map(doc => {
          // "Expired" here means the document's own expiry date had already
          // passed by the time it was submitted — not that it has since
          // expired — since that's the compliance check that matters (did
          // the contractor submit a document that was already out of date).
          const isExpired = !!(doc.expiry_date && submission.created_at && new Date(doc.expiry_date) < new Date(submission.created_at));
          return `
          <div style="padding: 8px; border: 1px solid ${isExpired ? 'var(--closing-today, #D8452B)' : 'var(--border)'}; border-radius: 4px; margin-bottom: 8px;${isExpired ? ' background:#FDECEA;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <span style="color: var(--ink);">📄 ${escapeHtmlClient(doc.file_name)}</span>
              <button onclick="downloadDocument('${doc.file_path}', '${doc.file_name}')"
                class="btn" style="padding: 4px 12px; font-size: 12px; flex-shrink:0;">
                Download
              </button>
            </div>
            ${doc.document_type ? `<p style="margin:6px 0 0 0; font-size:12px; color:var(--border);">Type: ${escapeHtmlClient(doc.document_type)}</p>` : ''}
            ${doc.expiry_date ? `<p style="margin:2px 0 0 0; font-size:12px; ${isExpired ? 'color:var(--closing-today, #D8452B); font-weight:bold;' : 'color:var(--border);'}">
              Expiry: ${new Date(doc.expiry_date).toLocaleDateString()}${isExpired ? ' — 🚩 Already expired at time of submission' : ''}
            </p>` : ''}
          </div>
        `;
        }).join('')
      : '<p style="color: var(--border); font-style: italic;">No documents submitted</p>';

    const detailsContent = document.getElementById('submission-details-content');
    const docsContent = document.getElementById('submission-documents-list');

    if (detailsContent) detailsContent.innerHTML = detailsHtml;
    if (docsContent) docsContent.innerHTML = docsHtml;

    const requestBox = document.getElementById('submission-info-request-box');
    if (requestBox) {
      if (submission.info_request_message) {
        requestBox.style.display = 'block';
        document.getElementById('submission-info-request-text').textContent = submission.info_request_message;
        document.getElementById('submission-info-request-date').textContent = submission.info_requested_at
          ? `Requested ${new Date(submission.info_requested_at).toLocaleString()}`
          : '';
      } else {
        requestBox.style.display = 'none';
      }
    }

    const responseBox = document.getElementById('submission-info-response-box');
    if (responseBox) {
      if (submission.info_response_message) {
        responseBox.style.display = 'block';
        document.getElementById('submission-info-response-text').textContent = submission.info_response_message;
        document.getElementById('submission-info-response-date').textContent = submission.info_response_at
          ? `Received ${new Date(submission.info_response_at).toLocaleString()}`
          : '';
      } else {
        responseBox.style.display = 'none';
      }
    }

    const statusSelect = document.getElementById('submission-status-update');
    if (statusSelect) {
      statusSelect.value = submission.status;
      statusSelect.dataset.submissionId = id;
    }
    const messageBox = document.getElementById('submission-info-request-message');
    if (messageBox) messageBox.value = '';
    onSubmissionStatusSelectChange();

    const title = document.getElementById('submission-title');
    if (title) title.textContent = submission.contractor_name;

    openModal('submission-detail-modal');

  } catch (err) {
    console.error('Error opening submission detail:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// Toggles the "what do you need?" message box and relabels the action
// button based on which status is currently selected — Request More
// Information needs a message + triggers an email, everything else is a
// plain status write.
function onSubmissionStatusSelectChange() {
  const statusSelect = document.getElementById('submission-status-update');
  const formBox = document.getElementById('submission-info-request-form');
  const actionBtn = document.getElementById('submission-status-action-btn');
  if (!statusSelect || !formBox || !actionBtn) return;

  const isInfoRequest = statusSelect.value === 'info_requested';
  formBox.style.display = isInfoRequest ? 'block' : 'none';
  actionBtn.textContent = isInfoRequest ? 'Send Request' : 'Update Status';
}

async function handleSubmissionStatusAction() {
  const statusSelect = document.getElementById('submission-status-update');
  if (!statusSelect || !statusSelect.dataset.submissionId) {
    showToast('Error: submission ID not found', 'error');
    return;
  }

  const id = statusSelect.dataset.submissionId;
  const newStatus = statusSelect.value;

  if (newStatus === 'info_requested') {
    await sendSubmissionInfoRequest(id);
    return;
  }

  try {
    const { error } = await client
      .from('rfq_submissions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    showToast('✅ Status updated!', 'success');
    closeModal('submission-detail-modal');
    loadSubmissions();

  } catch (err) {
    console.error('Error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// Emails the contractor asking for more information/documents via the
// request-submission-info Edge Function (Resend) — mirrors the pattern used
// for send-rfq-invites. The submission's status flips to 'info_requested'
// server-side once the email is queued.
async function sendSubmissionInfoRequest(submissionId) {
  const messageBox = document.getElementById('submission-info-request-message');
  const message = messageBox ? messageBox.value.trim() : '';

  if (!message) {
    showToast('Please describe what information you need', 'error');
    return;
  }

  try {
    showToast('Sending request...', 'info');
    await callEdgeFunction('request-submission-info', { submissionId, message });
    showToast('✅ Information request emailed to the contractor', 'success');
    closeModal('submission-detail-modal');
    loadSubmissions();
  } catch (err) {
    console.error('Error sending info request:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

function filterSubmissions() {
  loadSubmissions();
}

// ===== SUPER ADMIN =====
function openSuperAdminView() {
  if (!isSuperAdmin) {
    showToast('Not authorized', 'error');
    return;
  }
  showSuperAdminView();
}

function showSuperAdminView() {
  hideAllTopLevelViews();
  document.getElementById('super-admin-view').style.display = 'block';
  applyDefaultBranding();
  document.getElementById('brand-title').textContent = 'RFQ Hub — Platform Admin';

  // Only offer "Back to Dashboard" if there's actually a company dashboard to go back to.
  const backLink = document.getElementById('back-to-dashboard-link');
  if (backLink) backLink.style.display = currentCompany ? 'inline-block' : 'none';

  renderPlatformLogoPreview();
  loadSuperAdminCompanies();
  loadSuperAdminApplicants();

  // Always open on the first section for a predictable landing spot,
  // matching the company admin dashboard's reset-to-first-tab behavior.
  document.getElementById('super-invite-tab').style.display = 'block';
  document.getElementById('super-branding-tab').style.display = 'none';
  document.getElementById('super-companies-tab').style.display = 'none';
  document.getElementById('super-applicants-tab').style.display = 'none';
  document.getElementById('super-password-tab').style.display = 'none';
  document.querySelectorAll('.super-tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });
}

function closeSuperAdminView() {
  if (!currentCompany) {
    showToast("You're not a member of any company yet — invite one above to get started.", 'info');
    return;
  }
  showAdminView();
}

async function loadSuperAdminCompanies() {
  try {
    const { data: companies, error } = await client
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = document.getElementById('super-admin-companies-list');
    if (!companies || companies.length === 0) {
      list.innerHTML = '<p style="color:var(--border); text-align:center; padding:20px;">No companies yet.</p>';
      return;
    }

    list.innerHTML = companies.map(c => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border:1px solid var(--border); border-radius:4px; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${c.logo_url ? `<img src="${c.logo_url}" style="width:36px; height:36px; object-fit:contain; border-radius:6px;">` : ''}
          <div>
            <p style="margin:0; font-weight:600;">${c.name}</p>
            <p style="margin:0; font-size:12px; color:var(--border);">${c.contact_email || 'No contact email'} · Joined ${new Date(c.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="submission-status ${c.status === 'active' ? 'approved' : 'rejected'}">${c.status}</span>
          <button onclick="toggleCompanyStatus('${c.id}', '${c.status}')" class="btn secondary" style="padding:6px 12px; font-size:12px;">
            ${c.status === 'active' ? 'Suspend' : 'Reactivate'}
          </button>
          <button onclick="deleteCompany('${c.id}', '${(c.name || '').replace(/'/g, "\\'")}')" class="btn secondary" style="padding:6px 12px; font-size:12px; color:#D32F2F; border-color:#D32F2F;">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading companies:', err);
    showToast('Error loading companies: ' + err.message, 'error');
  }
}

// "Removed" suppliers are hidden from the default Supplier Database list
// (reversible removal, not a hard delete — see suspendSupplier/
// removeSupplier below) — this toggles whether the list also shows them.
let showRemovedSuppliers = false;

function toggleShowRemovedSuppliers() {
  showRemovedSuppliers = !showRemovedSuppliers;
  loadSuperAdminApplicants();
}

async function loadSuperAdminApplicants() {
  try {
    const { data: applicants, error } = await client
      .from('applicant_registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = document.getElementById('super-admin-applicants-list');
    if (!list) return;

    const allApplicants = applicants || [];
    const removedCount = allApplicants.filter(a => a.status === 'removed').length;
    const visibleApplicants = showRemovedSuppliers ? allApplicants : allApplicants.filter(a => a.status !== 'removed');

    const toggleHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
        <p style="color:var(--border); font-size:13px; margin:0;">${visibleApplicants.length} supplier${visibleApplicants.length === 1 ? '' : 's'} shown</p>
        ${removedCount > 0 ? `<button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px;" onclick="toggleShowRemovedSuppliers()">${showRemovedSuppliers ? 'Hide' : 'Show'} Removed (${removedCount})</button>` : ''}
      </div>
    `;

    if (allApplicants.length === 0) {
      list.innerHTML = '<p style="color:var(--border); text-align:center; padding:20px;">No one has registered yet.</p>';
      return;
    }
    if (visibleApplicants.length === 0) {
      list.innerHTML = toggleHtml + '<p style="color:var(--border); text-align:center; padding:20px;">No suppliers to show.</p>';
      return;
    }

    // Document fields present on the row, each rendered as a download
    // button when a path exists (private bucket — signed URL only).
    const docFields = (a) => {
      const fields = [
        ['CIPC/ID', a.cipc_document_path],
        ['Proof of Address', a.proof_of_address_document_path],
        ['SARS Info', a.sars_document_path],
        ['Proof of Banking', a.proof_of_banking_document_path],
        ['B-BBEE', a.bbbee_document_path],
        ['Health & Safety', a.health_safety_document_path],
        ['Special Permits', a.special_permits_document_path]
      ].filter(([, path]) => !!path);
      (a.other_documents || []).forEach(doc => fields.push([doc.name || 'Other Document', doc.path]));
      return fields;
    };

    const statusBadge = (a) => {
      if (a.status === 'suspended') return '<span class="submission-status info_requested">Suspended</span>';
      if (a.status === 'removed') return '<span class="submission-status rejected">Removed</span>';
      return '<span class="submission-status approved">Active</span>';
    };

    const statusActions = (a) => {
      const escapedName = (a.company_name || a.full_name || '').replace(/'/g, "\\'");
      if (a.status === 'active') {
        return `
          <button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px;" onclick="suspendSupplier('${a.id}', '${escapedName}')">Suspend</button>
          <button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px; color:#D32F2F; border-color:#D32F2F;" onclick="removeSupplier('${a.id}', '${escapedName}')">Remove</button>
        `;
      }
      if (a.status === 'suspended') {
        return `
          <button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px;" onclick="reactivateSupplier('${a.id}', '${escapedName}')">Reactivate</button>
          <button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px; color:#D32F2F; border-color:#D32F2F;" onclick="removeSupplier('${a.id}', '${escapedName}')">Remove</button>
        `;
      }
      // removed
      return `<button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px;" onclick="restoreSupplier('${a.id}', '${escapedName}')">Restore</button>`;
    };

    list.innerHTML = toggleHtml + `
      <div style="max-height:600px; overflow-y:auto;">
        ${visibleApplicants.map(a => `
          <div style="padding:15px; border:1px solid var(--border); border-radius:4px; margin-bottom:10px; ${a.status !== 'active' ? 'background:var(--bg-2);' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
              <div>
                <p style="margin:0; font-weight:600;">${a.company_name} ${statusBadge(a)}</p>
                <p style="margin:2px 0 0 0; font-size:13px; color:var(--ink);">${a.title ? a.title + ' ' : ''}${a.full_name}${a.designation ? ' · ' + a.designation : ''}</p>
                <p style="margin:2px 0 0 0; font-size:12px; color:var(--border);">${a.email}${a.phone ? ' · ' + a.phone : ''}${a.additional_phone ? ' · ' + a.additional_phone : ''}</p>
              </div>
              <p style="margin:0; font-size:12px; color:var(--border); white-space:nowrap;">Registered ${new Date(a.created_at).toLocaleDateString()}</p>
            </div>
            ${a.status !== 'active' ? `
              <div style="margin-top:10px; padding:10px; background:white; border:1px solid var(--border); border-radius:4px; font-size:12px;">
                <p style="margin:0;"><strong>${a.status === 'suspended' ? 'Suspended' : 'Removed'} — reason:</strong> ${a.status_reason || '—'}</p>
                <p style="margin:4px 0 0 0; color:var(--border);">${a.status_changed_by ? 'By ' + a.status_changed_by + ' · ' : ''}${a.status_changed_at ? new Date(a.status_changed_at).toLocaleString() : ''}</p>
              </div>
            ` : ''}
            <div style="margin-top:10px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:6px 20px; font-size:12px; color:var(--ink);">
              <p style="margin:0;"><strong>Years in Business:</strong> ${a.years_in_business != null ? a.years_in_business : '—'}</p>
              <p style="margin:0;"><strong>Notify Province:</strong> ${a.province || '—'}</p>
              <p style="margin:0; grid-column:1/-1;"><strong>Address:</strong> ${a.address || '—'}</p>
              ${a.website_social ? `<p style="margin:0; grid-column:1/-1;"><strong>Website/Social:</strong> ${a.website_social}</p>` : ''}
              <p style="margin:0; grid-column:1/-1;"><strong>Services:</strong> ${a.services_description || '—'}</p>
              <p style="margin:0; grid-column:1/-1;"><strong>Service Areas:</strong> ${a.service_areas || '—'}</p>
            </div>
            <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px;">
              ${docFields(a).map(([label, path]) => `
                <button type="button" class="btn secondary" style="padding:6px 12px; font-size:12px;" onclick="downloadSupplierDocument('${path}', '${label.replace(/'/g, "\\'")}')">📄 ${label}</button>
              `).join('') || '<p style="margin:0; font-size:12px; color:var(--border);">No documents on file.</p>'}
            </div>
            <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; border-top:1px solid var(--border); padding-top:10px;">
              ${statusActions(a)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    console.error('Error loading applicants:', err);
    const list = document.getElementById('super-admin-applicants-list');
    if (list) list.innerHTML = '<p style="color:var(--warning);">Error loading registered applicants.</p>';
  }
}

// Suspend/remove/reactivate/restore a supplier. Suspended and removed both
// stop them from applying to RFQs (enforced at the DB/RLS level, not just
// here — see the rfq_submissions insert policy) but per Brent's explicit
// instruction they can still browse/view RFQs either way. "Removed" is
// reversible (restore below), not a hard delete — the record, reason, and
// documents are kept, just hidden from the default list.
async function suspendSupplier(applicantId, name) {
  const reason = prompt(`Reason for suspending "${name}"?`);
  if (reason === null) return; // cancelled
  if (!reason.trim()) {
    showToast('❌ A reason is required to suspend a supplier.', 'error');
    return;
  }
  try {
    const { error } = await client
      .from('applicant_registrations')
      .update({
        status: 'suspended',
        status_reason: reason.trim(),
        status_changed_at: new Date().toISOString(),
        status_changed_by: currentUser ? currentUser.email : 'unknown'
      })
      .eq('id', applicantId);
    if (error) throw error;
    showToast(`✅ ${name} suspended.`, 'success');
    loadSuperAdminApplicants();
  } catch (err) {
    console.error('Error suspending supplier:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function removeSupplier(applicantId, name) {
  const reason = prompt(`Reason for removing "${name}"? This can be undone later via "Restore".`);
  if (reason === null) return; // cancelled
  if (!reason.trim()) {
    showToast('❌ A reason is required to remove a supplier.', 'error');
    return;
  }
  try {
    const { error } = await client
      .from('applicant_registrations')
      .update({
        status: 'removed',
        status_reason: reason.trim(),
        status_changed_at: new Date().toISOString(),
        status_changed_by: currentUser ? currentUser.email : 'unknown'
      })
      .eq('id', applicantId);
    if (error) throw error;
    showToast(`✅ ${name} removed from the Supplier Database.`, 'success');
    loadSuperAdminApplicants();
  } catch (err) {
    console.error('Error removing supplier:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function reactivateSupplier(applicantId, name) {
  if (!confirm(`Reactivate "${name}"? They will be able to apply to RFQs again.`)) return;
  try {
    const { error } = await client
      .from('applicant_registrations')
      .update({
        status: 'active',
        status_reason: null,
        status_changed_at: new Date().toISOString(),
        status_changed_by: currentUser ? currentUser.email : 'unknown'
      })
      .eq('id', applicantId);
    if (error) throw error;
    showToast(`✅ ${name} reactivated.`, 'success');
    loadSuperAdminApplicants();
  } catch (err) {
    console.error('Error reactivating supplier:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function restoreSupplier(applicantId, name) {
  if (!confirm(`Restore "${name}" to the Supplier Database as active?`)) return;
  try {
    const { error } = await client
      .from('applicant_registrations')
      .update({
        status: 'active',
        status_reason: null,
        status_changed_at: new Date().toISOString(),
        status_changed_by: currentUser ? currentUser.email : 'unknown'
      })
      .eq('id', applicantId);
    if (error) throw error;
    showToast(`✅ ${name} restored.`, 'success');
    loadSuperAdminApplicants();
  } catch (err) {
    console.error('Error restoring supplier:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function toggleCompanyStatus(companyId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
  try {
    const { error } = await client
      .from('companies')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', companyId);
    if (error) throw error;
    showToast(`✅ Company ${newStatus}`, 'success');
    loadSuperAdminCompanies();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteCompany(companyId, companyName) {
  const confirmed = window.confirm(`Permanently delete "${companyName}" and all of its RFQs, invitations and submissions? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const { error } = await client.from('companies').delete().eq('id', companyId);
    if (error) throw error;
    showToast('✅ Company deleted', 'success');
    loadSuperAdminCompanies();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== UTILITY FUNCTIONS =====
function showToast(message, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}

function generateToken() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `token-${random}-${timestamp}`;
}

function generateUUID() {
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('✅ Link copied!', 'success');
  }).catch(() => {
    showToast('Error copying', 'error');
  });
}

async function copyAllRFQLinks(rfqId) {
  try {
    const { data: invitations } = await client
      .from('rfq_invitations')
      .select('*')
      .eq('rfq_id', rfqId);

    if (!invitations || invitations.length === 0) {
      showToast('No contractor links to copy', 'info');
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;
    const allLinks = invitations.map(inv => `${baseUrl}?rfq=${inv.invitation_token}`).join('\n');

    navigator.clipboard.writeText(allLinks).then(() => {
      showToast(`✅ ${invitations.length} links copied!`, 'success');
    }).catch(() => {
      showToast('Error copying', 'error');
    });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function showAddContractorForm(rfqId) {
  const email = prompt('Enter contractor email:');
  if (!email) return;

  try {
    const { data: inv, error } = await client
      .from('rfq_invitations')
      .insert([{
        rfq_id: rfqId,
        contractor_email: email,
        invitation_token: generateToken(),
        used: false
      }])
      .select()
      .single();

    if (error) throw error;

    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?rfq=${inv.invitation_token}`;

    showToast('✅ Contractor added — sending invite email...', 'success');
    navigator.clipboard.writeText(link);
    await sendRFQInviteEmails(rfqId, [inv]);
    loadRFQConsole();

  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function showGeneratedLinks(rfqId, invitations) {
  window.lastInvitations = invitations;

  const baseUrl = window.location.origin + window.location.pathname;

  let linksHtml = '<div style="font-family: monospace; font-size: 12px; line-height: 1.8;">';

  invitations.forEach((inv, idx) => {
    const link = `${baseUrl}?rfq=${inv.invitation_token}`;
    linksHtml += `
      <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">
        <strong style="color: var(--ink);">${idx + 1}. ${inv.contractor_email}</strong><br>
        <code style="background: var(--bg-2); padding: 8px; display: block; word-break: break-all; margin-top: 5px; border-radius: 4px;">${link}</code>
      </div>
    `;
  });

  linksHtml += '</div>';

  const linksContainer = document.getElementById('generated-links-list');
  if (linksContainer) linksContainer.innerHTML = linksHtml;

  openModal('generated-links-modal');
}

function copyAllLinks() {
  if (!window.lastInvitations || window.lastInvitations.length === 0) {
    showToast('No links to copy', 'error');
    return;
  }

  const baseUrl = window.location.origin + window.location.pathname;
  const links = window.lastInvitations.map(inv => {
    return `${baseUrl}?rfq=${inv.invitation_token}`;
  }).join('\n');

  navigator.clipboard.writeText(links).then(() => {
    showToast('✅ URLs copied!', 'success');
  }).catch(() => {
    showToast('Error copying', 'error');
  });
}

async function downloadDocument(path, name) {
  try {
    const { data, error } = await client.storage.from('rfq-documents').createSignedUrl(path, 120);
    if (error) throw error;
    if (data && data.signedUrl) {
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = name;
      link.target = '_blank';
      link.click();
      showToast('✅ Download started', 'success');
    }
  } catch (err) {
    console.error('Download error:', err);
    showToast('Error downloading document: ' + err.message, 'error');
  }
}

// Same pattern as downloadDocument() above, but against the private
// 'supplier-documents' bucket (only readable by the super admin) used for
// Supplier Database registration documents.
async function downloadSupplierDocument(path, name) {
  try {
    const { data, error } = await client.storage.from('supplier-documents').createSignedUrl(path, 120);
    if (error) throw error;
    if (data && data.signedUrl) {
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = name;
      link.target = '_blank';
      link.click();
      showToast('✅ Download started', 'success');
    }
  } catch (err) {
    console.error('Download error:', err);
    showToast('Error downloading document: ' + err.message, 'error');
  }
}

function acceptPOPIA() {
  closeModal('popia-modal');
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, initializing...');
  setupCreateRFQForm();

  const provinceFilter = document.getElementById('public-rfq-province-filter');
  if (provinceFilter) {
    provinceFilter.addEventListener('change', () => loadPublicRFQList());
  }

  const sortFilter = document.getElementById('public-rfq-sort');
  if (sortFilter) {
    sortFilter.addEventListener('change', () => loadPublicRFQList());
  }

  const heroSearchForm = document.getElementById('hero-search-form');
  if (heroSearchForm) {
    heroSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadPublicRFQList();
    });
  }

  const footerYear = document.getElementById('footer-year');
  if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
  }
});
