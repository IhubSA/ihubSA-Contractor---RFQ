/* ============================================================
   guide.js  –  Guided Tour  &  What's New  for RFQ Hub
   Drop-in: loads AFTER app.js, touches nothing inside it.
   ============================================================ */
(function () {
  'use strict';

  // ── Guard: wait for the globals app.js exposes ──────────────
  if (typeof client === 'undefined' || typeof showAdminView !== 'function') {
    console.warn('[guide] app.js globals not ready – aborting.');
    return;
  }

  /* ==========================================================
     §1  STYLES  (injected once)
     ========================================================== */
  const STYLE = document.createElement('style');
  STYLE.textContent = `
    /* ---------- Tour overlay & spotlight ---------- */
    #tour-overlay{position:fixed;inset:0;z-index:90000;pointer-events:none;transition:opacity .25s}
    #tour-overlay.active{pointer-events:auto}
    #tour-spotlight{position:absolute;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);transition:all .35s ease;z-index:90001;pointer-events:none}

    /* ---------- Tooltip ---------- */
    #tour-tooltip{position:absolute;z-index:90002;background:#fff;color:#1a1a1a;border-radius:12px;
      padding:24px 22px 18px;max-width:370px;width:max-content;box-shadow:0 12px 40px rgba(0,0,0,.25);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transition:opacity .2s,transform .2s}
    #tour-tooltip.hidden{opacity:0;transform:translateY(8px);pointer-events:none}
    #tour-tooltip h3{margin:0 0 6px;font-size:15px;font-weight:700;color:#0F3557}
    #tour-tooltip p{margin:0 0 16px;font-size:13.5px;line-height:1.55;color:#444}
    .tour-step-count{font-size:11px;color:#999;margin-bottom:4px}
    .tour-btn-row{display:flex;gap:8px;align-items:center;justify-content:flex-end}
    .tour-btn{padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:background .15s,color .15s}
    .tour-btn-primary{background:#0F3557;color:#fff}.tour-btn-primary:hover{background:#163d63}
    .tour-btn-secondary{background:#f0f0f0;color:#333}.tour-btn-secondary:hover{background:#e0e0e0}
    .tour-btn-skip{background:none;color:#999;font-weight:500;font-size:12px;padding:7px 10px}.tour-btn-skip:hover{color:#555}
    .tour-progress{display:flex;gap:4px;margin-top:10px}
    .tour-dot{width:7px;height:7px;border-radius:50%;background:#ddd;transition:background .2s}
    .tour-dot.done{background:#C7A94E}
    .tour-dot.current{background:#0F3557}

    /* ---------- Welcome / Complete modal ---------- */
    .tour-modal-bg{position:fixed;inset:0;z-index:91000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;animation:tourFadeIn .25s}
    .tour-modal{background:#fff;border-radius:16px;padding:36px 32px 28px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:tourSlideUp .3s}
    .tour-modal h2{margin:0 0 8px;font-size:20px;color:#0F3557}
    .tour-modal p{font-size:14px;color:#555;line-height:1.6;margin:0 0 22px}
    .tour-modal .tour-btn{padding:10px 28px;font-size:14px}
    @keyframes tourFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes tourSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}

    /* ---------- Confetti ---------- */
    .confetti-piece{position:fixed;z-index:92000;width:8px;height:12px;border-radius:2px;pointer-events:none;animation:confettiFall 2.2s ease forwards}
    @keyframes confettiFall{0%{opacity:1;transform:translateY(0) rotate(0)}100%{opacity:0;transform:translateY(110vh) rotate(720deg)}}

    /* ---------- What's New pill ---------- */
    #whats-new-pill{position:fixed;bottom:24px;right:24px;z-index:80000;background:#0F3557;color:#fff;
      padding:10px 18px;border-radius:28px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.2);
      display:none;align-items:center;gap:8px;transition:transform .15s,box-shadow .15s;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    #whats-new-pill:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(0,0,0,.28)}
    #whats-new-pill .wn-badge{background:#C7A94E;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;min-width:18px;text-align:center}

    /* ---------- What's New pop-up ---------- */
    .wn-popup-bg{position:fixed;inset:0;z-index:85000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:tourFadeIn .2s}
    .wn-popup{background:#fff;border-radius:14px;max-width:520px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 16px 50px rgba(0,0,0,.25);animation:tourSlideUp .25s;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    .wn-popup-header{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 14px;border-bottom:1px solid #eee}
    .wn-popup-header h2{margin:0;font-size:18px;color:#0F3557}
    .wn-popup-close{background:none;border:none;font-size:22px;color:#999;cursor:pointer;padding:0 4px}.wn-popup-close:hover{color:#333}
    .wn-popup-body{padding:16px 22px 22px}
    .wn-card{background:#f9f9f9;border-radius:10px;padding:16px 18px;margin-bottom:12px;border-left:4px solid #C7A94E}
    .wn-card h4{margin:0 0 4px;font-size:14px;color:#0F3557}.wn-card p{margin:0;font-size:13px;color:#555;line-height:1.55}
    .wn-card .wn-meta{font-size:11px;color:#999;margin-top:6px}
    .wn-empty{text-align:center;padding:30px 0;color:#999;font-size:14px}
    .wn-cat{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;border-radius:4px;margin-bottom:6px}
    .wn-cat-feature{background:#E8F3EC;color:#2E6B4F}
    .wn-cat-improvement{background:#E8EEF5;color:#0F3557}
    .wn-cat-fix{background:#FFF3E0;color:#B27A1A}
    .wn-cat-announcement{background:#F3E8F5;color:#6A1B9A}

    /* ---------- What's New admin panel ---------- */
    #wn-admin-panel{display:none}
    .wn-admin-card{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px;justify-content:space-between}
    .wn-admin-card h4{margin:0 0 2px;font-size:13px;color:#1a1a1a}.wn-admin-card p{margin:0;font-size:12px;color:#666;line-height:1.5}
    .wn-admin-actions{display:flex;gap:6px;flex-shrink:0}
    .wn-admin-btn{padding:5px 10px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #ddd;background:#fff;color:#555;transition:background .15s}
    .wn-admin-btn:hover{background:#f5f5f5}
    .wn-admin-btn.danger{color:#c0392b;border-color:#f5c6cb}.wn-admin-btn.danger:hover{background:#fdecea}

    /* ---------- Footer link ---------- */
    .wn-footer-link{cursor:pointer;color:inherit;opacity:.85;transition:opacity .15s}.wn-footer-link:hover{opacity:1;text-decoration:underline}
  `;
  document.head.appendChild(STYLE);

  /* ==========================================================
     §2  UTILITY HELPERS
     ========================================================== */
  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return [...document.querySelectorAll(sel)]; }

  function relDate(iso) {
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ==========================================================
     §3  GUIDED TOUR  –  engine
     ========================================================== */
  let tourActive = false;
  let tourSteps = [];
  let tourIdx = 0;

  // ── Build the overlay + tooltip DOM once ──
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  document.body.appendChild(overlay);

  const spotlight = document.createElement('div');
  spotlight.id = 'tour-spotlight';
  overlay.appendChild(spotlight);

  const tooltip = document.createElement('div');
  tooltip.id = 'tour-tooltip';
  tooltip.className = 'hidden';
  document.body.appendChild(tooltip);

  // ── Position helpers ──
  function positionSpotlight(el) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    spotlight.style.left   = (r.left - pad + window.scrollX) + 'px';
    spotlight.style.top    = (r.top  - pad + window.scrollY) + 'px';
    spotlight.style.width  = (r.width  + pad * 2) + 'px';
    spotlight.style.height = (r.height + pad * 2) + 'px';
  }

  function positionTooltip(el) {
    const r = el.getBoundingClientRect();
    const tw = 370, gap = 14;
    let left, top;

    // Prefer placing below the element
    top = r.bottom + gap + window.scrollY;
    left = r.left + r.width / 2 - tw / 2 + window.scrollX;

    // If tooltip would go below viewport, place it above
    if (r.bottom + gap + 200 > window.innerHeight) {
      top = r.top - gap - 200 + window.scrollY;
    }
    // Clamp horizontal
    left = Math.max(12, Math.min(left, window.innerWidth - tw - 12));

    tooltip.style.left = left + 'px';
    tooltip.style.top  = top + 'px';
  }

  function renderTooltip(step, idx, total) {
    const dots = Array.from({ length: total }, (_, i) =>
      `<span class="tour-dot ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}"></span>`
    ).join('');

    tooltip.innerHTML = `
      <div class="tour-step-count">Step ${idx + 1} of ${total}</div>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <div class="tour-btn-row">
        <button class="tour-btn tour-btn-skip" id="tour-skip">Skip tour</button>
        ${idx > 0 ? '<button class="tour-btn tour-btn-secondary" id="tour-back">Back</button>' : ''}
        <button class="tour-btn tour-btn-primary" id="tour-next">${idx === total - 1 ? 'Finish' : 'Next'}</button>
      </div>
      <div class="tour-progress">${dots}</div>
    `;
    tooltip.classList.remove('hidden');

    qs('#tour-skip').onclick = () => endTour(false);
    if (qs('#tour-back')) qs('#tour-back').onclick = () => goStep(tourIdx - 1);
    qs('#tour-next').onclick = () => {
      if (idx === total - 1) endTour(true);
      else goStep(tourIdx + 1);
    };
  }

  function goStep(idx) {
    tourIdx = idx;
    const step = tourSteps[idx];
    if (!step) return endTour(true);

    // Run the step's prep action (e.g. switch to a tab)
    if (step.prep) step.prep();

    // Small delay so the DOM can repaint after prep
    setTimeout(() => {
      const el = typeof step.el === 'function' ? step.el() : qs(step.el);
      if (!el || !visible(el)) {
        // Element doesn't exist or isn't visible – skip this step
        if (idx < tourSteps.length - 1) goStep(idx + 1);
        else endTour(true);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        positionSpotlight(el);
        positionTooltip(el);
        renderTooltip(step, idx, tourSteps.length);
      }, 300);
    }, 250);
  }

  function startTour() {
    // Filter steps to only those whose elements actually exist
    tourSteps = buyerSteps().filter(s => {
      const el = typeof s.el === 'function' ? s.el() : qs(s.el);
      // For steps with a prep function, we tentatively keep them — the
      // goStep function will skip if the element isn't visible after prep.
      // But if the element selector will never resolve, skip now.
      if (!s.prep && !el) return false;
      return true;
    });
    if (tourSteps.length === 0) return;
    tourActive = true;
    tourIdx = 0;
    overlay.classList.add('active');
    goStep(0);
  }

  async function endTour(completed) {
    tourActive = false;
    overlay.classList.remove('active');
    spotlight.style.width = '0';
    spotlight.style.height = '0';
    tooltip.classList.add('hidden');

    if (completed) {
      showCompleteModal();
      spawnConfetti();
    }

    // Persist that the tour is done
    try {
      if (currentUser) {
        await client.auth.updateUser({
          data: { rfqhub_tour_done: true }
        });
      }
    } catch (e) {
      console.warn('[guide] Could not save tour state:', e);
    }
  }

  // ── Welcome modal ──
  function showWelcomeModal() {
    const bg = document.createElement('div');
    bg.className = 'tour-modal-bg';
    bg.innerHTML = `
      <div class="tour-modal">
        <div style="margin-bottom:16px">
          <svg width="52" height="52" viewBox="0 0 100 100" style="margin:0 auto;display:block">
            <defs><linearGradient id="tg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0F3557"/><stop offset="100%" stop-color="#1a4a73"/></linearGradient></defs>
            <rect width="100" height="100" rx="22" fill="url(#tg1)"/>
            <text x="50" y="62" text-anchor="middle" fill="#C7A94E" font-weight="700" font-size="36" font-family="Georgia,serif">RFQ</text>
          </svg>
        </div>
        <h2>Welcome to RFQ Hub!</h2>
        <p>Take a quick tour to learn how to create and manage your Requests for Quotation, review contractor submissions, and configure your company settings.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="tour-btn tour-btn-secondary" id="tour-skip-welcome">Maybe later</button>
          <button class="tour-btn tour-btn-primary" id="tour-start-welcome">Let's go!</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);

    qs('#tour-skip-welcome').onclick = () => {
      bg.remove();
      // Mark as done so it doesn't keep showing
      if (currentUser) {
        client.auth.updateUser({ data: { rfqhub_tour_done: true } }).catch(() => {});
      }
    };
    qs('#tour-start-welcome').onclick = () => {
      bg.remove();
      startTour();
    };
  }

  // ── Complete modal ──
  function showCompleteModal() {
    const bg = document.createElement('div');
    bg.className = 'tour-modal-bg';
    bg.innerHTML = `
      <div class="tour-modal">
        <div style="font-size:42px;margin-bottom:10px">🎉</div>
        <h2>You're all set!</h2>
        <p>You now know the basics of managing your RFQs. Start by creating your first Request for Quotation, or explore the dashboard at your own pace.</p>
        <button class="tour-btn tour-btn-primary" id="tour-done-close">Get started</button>
      </div>
    `;
    document.body.appendChild(bg);
    qs('#tour-done-close').onclick = () => bg.remove();
  }

  // ── Confetti ──
  function spawnConfetti() {
    const colours = ['#C7A94E', '#0F3557', '#2E6B4F', '#E8A838', '#5C6BC0', '#EF5350'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'confetti-piece';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.top = '-12px';
      c.style.background = colours[Math.floor(Math.random() * colours.length)];
      c.style.animationDelay = Math.random() * 0.8 + 's';
      c.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
  }

  /* ==========================================================
     §4  TOUR STEPS  –  Buyer (company admin) tour
     ========================================================== */
  function buyerSteps() {
    return [
      {
        el: '#admin-view .admin-sidebar',
        title: 'Your Dashboard Sidebar',
        body: 'This is your navigation sidebar. Use it to switch between creating RFQs, managing your console, reviewing submissions, your team, and settings.',
        prep: null
      },
      {
        el: () => qsa('.company-tab-btn').find(b => b.textContent.trim().startsWith('Create')),
        title: 'Create RFQ',
        body: 'Start here to draft a new Request for Quotation. Fill in the details, set a deadline, and choose which suppliers to invite.',
        prep: () => switchAdminTab('create', qsa('.company-tab-btn')[0])
      },
      {
        el: '#create-rfq-form',
        title: 'RFQ Form',
        body: 'Fill in the RFQ title, description, deadline, and required documents. Once ready, publish it to make it visible to suppliers.',
        prep: null
      },
      {
        el: '#publish-rfq-btn',
        title: 'Publish Your RFQ',
        body: 'When your RFQ is ready, hit this button to publish it. Published RFQs appear on the public marketplace for suppliers to find and respond to.',
        prep: null
      },
      {
        el: () => qsa('.company-tab-btn').find(b => b.textContent.trim().startsWith('RFQ Console')),
        title: 'RFQ Console',
        body: 'View and manage all your RFQs in one place. Track their status, see how many responses you\'ve received, and take action.',
        prep: () => switchAdminTab('console', qsa('.company-tab-btn').find(b => b.textContent.trim().startsWith('RFQ Console')))
      },
      {
        el: () => qsa('.company-tab-btn').find(b => b.textContent.trim().startsWith('Review')),
        title: 'Review Submissions',
        body: 'This is where you review and compare contractor submissions. Evaluate quotes, documents, and compliance side by side.',
        prep: () => switchAdminTab('submissions', qsa('.company-tab-btn').find(b => b.textContent.trim().startsWith('Review')))
      },
      {
        el: () => qsa('.company-tab-btn').find(b => b.textContent.trim() === 'Team'),
        title: 'Team Management',
        body: 'Manage your company\'s team members. Invite colleagues, assign roles, and control who can create and manage RFQs.',
        prep: () => switchAdminTab('team', qsa('.company-tab-btn').find(b => b.textContent.trim() === 'Team'))
      },
      {
        el: () => qsa('.company-tab-btn').find(b => b.textContent.trim() === 'Settings'),
        title: 'Company Settings',
        body: 'Configure your company profile, contact details, logo, and other preferences that appear on your published RFQs.',
        prep: () => switchAdminTab('settings', qsa('.company-tab-btn').find(b => b.textContent.trim() === 'Settings'))
      },
      {
        el: () => qs('button[onclick="logoutAdmin()"]') || qs('[onclick*="logoutAdmin"]'),
        title: 'Logout',
        body: 'When you\'re done, use this button to securely log out of your account.',
        prep: null
      }
    ];
  }

  /* ==========================================================
     §5  WHAT'S NEW  –  engine
     ========================================================== */

  // ── Pill (bottom-right floating button) ──
  const pill = document.createElement('div');
  pill.id = 'whats-new-pill';
  pill.innerHTML = `<span>What's New</span><span class="wn-badge" id="wn-badge">0</span>`;
  document.body.appendChild(pill);
  pill.onclick = () => openWhatsNewPopup();

  // ── Load updates from platform_updates table ──
  let wnUpdates = [];

  async function loadWhatsNewUpdates() {
    try {
      const { data, error } = await client
        .from('platform_updates')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      wnUpdates = data || [];
    } catch (e) {
      // Table might not exist yet — that's OK
      console.log('[guide] platform_updates:', e.message);
      wnUpdates = [];
    }
  }

  function countUnseen() {
    if (!currentUser) return 0;
    const seenAt = currentUser.user_metadata?.whats_new_seen_at;
    if (!seenAt) return wnUpdates.length;
    const d = new Date(seenAt);
    return wnUpdates.filter(u => new Date(u.published_at) > d).length;
  }

  function updatePill() {
    const n = countUnseen();
    const badge = qs('#wn-badge');
    if (badge) badge.textContent = n;
    pill.style.display = (wnUpdates.length > 0) ? 'flex' : 'none';
    // Hide badge dot when all seen
    if (badge) badge.style.display = n > 0 ? 'inline-block' : 'none';
  }

  async function markSeen() {
    try {
      if (currentUser) {
        await client.auth.updateUser({
          data: { whats_new_seen_at: new Date().toISOString() }
        });
      }
    } catch (e) { /* non-critical */ }
  }

  // ── Pop-up ──
  function openWhatsNewPopup() {
    const catClass = c => 'wn-cat wn-cat-' + (c || 'feature').toLowerCase();

    const cards = wnUpdates.length === 0
      ? '<div class="wn-empty">No updates yet — check back soon!</div>'
      : wnUpdates.map(u => `
          <div class="wn-card">
            <span class="${catClass(u.category)}">${u.category || 'Feature'}</span>
            <h4>${esc(u.title)}</h4>
            <p>${esc(u.body)}</p>
            <div class="wn-meta">${relDate(u.published_at)}</div>
          </div>
        `).join('');

    const bg = document.createElement('div');
    bg.className = 'wn-popup-bg';
    bg.innerHTML = `
      <div class="wn-popup">
        <div class="wn-popup-header">
          <h2>What's New</h2>
          <button class="wn-popup-close" id="wn-close">&times;</button>
        </div>
        <div class="wn-popup-body">${cards}</div>
      </div>
    `;
    document.body.appendChild(bg);

    bg.querySelector('#wn-close').onclick = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) bg.remove(); };

    markSeen().then(updatePill);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  /* ==========================================================
     §6  WHAT'S NEW  –  Admin CRUD panel
     Injected into the Super Admin view as an extra tab.
     ========================================================== */

  function injectWhatsNewAdminTab() {
    // Only for super admins
    if (!isSuperAdmin) return;

    const sidebar = qs('#super-admin-view .admin-sidebar');
    if (!sidebar) return;

    // Don't add if already there
    if (qs('#wn-admin-tab-btn')) return;

    // Add the tab button
    const btn = document.createElement('button');
    btn.id = 'wn-admin-tab-btn';
    btn.className = 'super-tab-btn';
    btn.textContent = "What's New";
    btn.onclick = () => switchSuperAdminTab('wn-admin', btn);
    sidebar.appendChild(btn);

    // Add the tab content panel
    const adminContent = qs('#super-admin-view .admin-content');
    if (!adminContent) return;

    const panel = document.createElement('div');
    panel.id = 'wn-admin-tab';
    panel.className = 'super-tab';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div id="wn-admin-panel" style="display:block">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
          <h2 style="margin:0;font-size:18px;color:#0F3557">Platform Updates</h2>
          <button class="btn gold" id="wn-add-btn" style="padding:8px 18px;font-size:13px">+ New Update</button>
        </div>
        <div id="wn-admin-list"></div>
      </div>

      <!-- Add/Edit form (hidden by default) -->
      <div id="wn-form-wrap" style="display:none;background:#f9f9f9;border-radius:10px;padding:22px;max-width:560px">
        <h3 id="wn-form-title" style="margin:0 0 16px;font-size:16px;color:#0F3557">New Update</h3>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:#555">Title</label>
          <input id="wn-f-title" type="text" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-top:4px" maxlength="120">
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:#555">Body</label>
          <textarea id="wn-f-body" rows="4" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-top:4px;resize:vertical" maxlength="1000"></textarea>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:140px">
            <label style="font-size:12px;font-weight:600;color:#555">Category</label>
            <select id="wn-f-cat" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-top:4px">
              <option value="Feature">Feature</option>
              <option value="Improvement">Improvement</option>
              <option value="Fix">Fix</option>
              <option value="Announcement">Announcement</option>
            </select>
          </div>
          <div style="flex:1;min-width:140px">
            <label style="font-size:12px;font-weight:600;color:#555">Audience</label>
            <select id="wn-f-audience" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-top:4px">
              <option value="all">Everyone</option>
              <option value="buyer">Buyers only</option>
              <option value="supplier">Suppliers only</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn secondary" id="wn-f-cancel" style="padding:8px 18px;font-size:13px">Cancel</button>
          <button class="btn gold" id="wn-f-save" style="padding:8px 18px;font-size:13px">Publish</button>
        </div>
      </div>
    `;
    adminContent.appendChild(panel);

    // Wire up buttons
    qs('#wn-add-btn').onclick = () => openWnForm(null);
    qs('#wn-f-cancel').onclick = closeWnForm;
    qs('#wn-f-save').onclick = saveWnUpdate;
  }

  let editingUpdateId = null;

  function openWnForm(update) {
    editingUpdateId = update ? update.id : null;
    qs('#wn-form-title').textContent = update ? 'Edit Update' : 'New Update';
    qs('#wn-f-title').value = update ? update.title : '';
    qs('#wn-f-body').value = update ? update.body : '';
    qs('#wn-f-cat').value = update ? update.category : 'Feature';
    qs('#wn-f-audience').value = update ? (update.audience || 'all') : 'all';
    qs('#wn-form-wrap').style.display = 'block';
    qs('#wn-f-title').focus();
  }

  function closeWnForm() {
    qs('#wn-form-wrap').style.display = 'none';
    editingUpdateId = null;
  }

  async function saveWnUpdate() {
    const title = qs('#wn-f-title').value.trim();
    const body = qs('#wn-f-body').value.trim();
    const category = qs('#wn-f-cat').value;
    const audience = qs('#wn-f-audience').value;

    if (!title) { showToast('Please enter a title.', 'error'); return; }
    if (!body) { showToast('Please enter a description.', 'error'); return; }

    try {
      if (editingUpdateId) {
        const { error } = await client.from('platform_updates').update({
          title, body, category, audience, updated_at: new Date().toISOString()
        }).eq('id', editingUpdateId);
        if (error) throw error;
        showToast('Update saved.', 'success');
      } else {
        const { error } = await client.from('platform_updates').insert({
          title, body, category, audience,
          is_published: true,
          published_at: new Date().toISOString(),
          created_by: currentUser.id
        });
        if (error) throw error;
        showToast('Update published!', 'success');
      }
      closeWnForm();
      await loadWhatsNewUpdates();
      renderWnAdminList();
      updatePill();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }

  async function deleteWnUpdate(id) {
    if (!confirm('Delete this update?')) return;
    try {
      const { error } = await client.from('platform_updates').delete().eq('id', id);
      if (error) throw error;
      showToast('Update deleted.', 'success');
      await loadWhatsNewUpdates();
      renderWnAdminList();
      updatePill();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }

  function renderWnAdminList() {
    const list = qs('#wn-admin-list');
    if (!list) return;

    if (wnUpdates.length === 0) {
      list.innerHTML = '<div class="wn-empty">No updates yet. Click "+ New Update" to create one.</div>';
      return;
    }

    list.innerHTML = wnUpdates.map(u => `
      <div class="wn-admin-card">
        <div style="flex:1;min-width:0">
          <h4>${esc(u.title)}</h4>
          <p>${esc(u.body).substring(0, 120)}${u.body && u.body.length > 120 ? '…' : ''}</p>
          <div style="font-size:11px;color:#999;margin-top:4px">${u.category || 'Feature'} · ${u.audience || 'all'} · ${relDate(u.published_at || u.created_at)}</div>
        </div>
        <div class="wn-admin-actions">
          <button class="wn-admin-btn" data-edit="${u.id}">Edit</button>
          <button class="wn-admin-btn danger" data-del="${u.id}">Delete</button>
        </div>
      </div>
    `).join('');

    // Wire edit/delete buttons
    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        const u = wnUpdates.find(x => x.id === btn.dataset.edit);
        if (u) openWnForm(u);
      };
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => deleteWnUpdate(btn.dataset.del);
    });
  }

  /* ==========================================================
     §7  FOOTER LINK  –  "What's New" in the public footer
     ========================================================== */
  function addFooterLink() {
    const footerCols = qsa('#site-footer .footer-col');
    if (footerCols.length === 0) return;
    // Add to the last footer column
    const lastCol = footerCols[footerCols.length - 1];
    // Avoid duplicates
    if (lastCol.querySelector('.wn-footer-link')) return;
    const link = document.createElement('p');
    link.className = 'wn-footer-link';
    link.textContent = "What's New";
    link.onclick = () => openWhatsNewPopup();
    lastCol.appendChild(link);
  }

  /* ==========================================================
     §8  HOOKS  –  wrap existing functions
     These intercepts run guide logic AFTER the original
     function, so nothing in app.js is changed.
     ========================================================== */

  // ── showAdminView → maybe show tour ──
  const _showAdminView = showAdminView;
  showAdminView = function () {
    _showAdminView.apply(this, arguments);
    // After admin view loads, check if tour should start
    setTimeout(() => {
      if (currentUser && !currentUser.user_metadata?.rfqhub_tour_done && !tourActive) {
        showWelcomeModal();
      }
    }, 600);
  };

  // ── showSuperAdminView → inject What's New admin tab ──
  const _showSuperAdminView = showSuperAdminView;
  showSuperAdminView = function () {
    _showSuperAdminView.apply(this, arguments);
    setTimeout(() => {
      injectWhatsNewAdminTab();
      renderWnAdminList();
    }, 200);
  };

  // ── switchSuperAdminTab → handle the injected What's New tab ──
  const _switchSuperAdminTab = switchSuperAdminTab;
  switchSuperAdminTab = function (tabName, button) {
    if (tabName === 'wn-admin') {
      // Hide all super tabs, deactivate buttons, show ours
      qsa('.super-tab').forEach(t => t.style.display = 'none');
      qsa('.super-tab-btn').forEach(b => b.classList.remove('active'));
      const panel = qs('#wn-admin-tab');
      if (panel) panel.style.display = 'block';
      if (button) button.classList.add('active');
      renderWnAdminList();
      return;
    }
    // Normal super admin tab
    _switchSuperAdminTab.apply(this, arguments);
    // Also hide the WN panel since it's not a native tab
    const panel = qs('#wn-admin-tab');
    if (panel) panel.style.display = 'none';
  };

  // ── showLandingView → footer link + pill ──
  const _showLandingView = showLandingView;
  showLandingView = function () {
    _showLandingView.apply(this, arguments);
    setTimeout(() => {
      addFooterLink();
      updatePill();
    }, 200);
  };

  // ── logoutAdmin → hide pill, reset ──
  const _logoutAdmin = logoutAdmin;
  logoutAdmin = async function () {
    pill.style.display = 'none';
    tourActive = false;
    overlay.classList.remove('active');
    tooltip.classList.add('hidden');
    return _logoutAdmin.apply(this, arguments);
  };

  /* ==========================================================
     §9  INIT  –  load data after app is ready
     ========================================================== */
  async function guideInit() {
    // Wait a tick for initApp to finish setting currentUser
    await new Promise(r => setTimeout(r, 800));
    if (!currentUser) {
      // Not logged in — just add footer link and pill for public updates
      await loadWhatsNewUpdates();
      addFooterLink();
      updatePill();
      return;
    }
    await loadWhatsNewUpdates();
    updatePill();
  }

  // Kick off
  if (document.readyState === 'complete') {
    guideInit();
  } else {
    window.addEventListener('load', () => guideInit());
  }

})();
