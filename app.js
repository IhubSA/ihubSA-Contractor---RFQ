// RFQ Hub - Multi-company Application Logic

const SUPABASE_URL = 'https://zilumoopwnrtrtnsmjhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbHVtb29wd25ydHJ0bnNtamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTU2MzgsImV4cCI6MjEwMTY3MTYzOH0.t8aQkOU29pwG9fwW9BlTwd4oie2jxkZa43mb3yc55kg';

let client = null;
let currentUser = null;
let currentCompany = null;
let isSuperAdmin = false;
let currentRFQId = null;
let isSubmittingRFQ = false;
window.lastInvitations = [];

const DEFAULT_HERO_SUBTITLE = "Open requests for quotation. Apply directly online — you'll get a reference number and a confirmation the moment your application is received.";

// ===== INITIALIZATION =====
async function initApp() {
  console.log('Initializing RFQ Hub...');

  client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase connected');

  setupStaticForms();

  const params = new URLSearchParams(window.location.search);
  const rfqToken = params.get('rfq');
  const wantsAdmin = params.has('admin');
  const authType = getUrlHashParams().get('type'); // 'invite' or 'recovery' when landing from an invite/reset link

  if (rfqToken) {
    console.log('Loading RFQ with token:', rfqToken);
    applyDefaultBranding();
    setHeaderActions('contractor');
    await loadContractorView(rfqToken);
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

  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm && !changePasswordForm.dataset.wired) {
    changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    changePasswordForm.dataset.wired = 'true';
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
}

function hideAllPublicSections() {
  ['rfq-portal', 'no-rfq-message', 'landing-section', 'login-section', 'set-password-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function setHeaderActions(mode) {
  const el = document.getElementById('header-actions');
  if (!el) return;
  if (mode === 'loggedOut') {
    el.innerHTML = `
      <button onclick="showLoginForm()" class="btn gold" style="padding:8px 16px;">Log In</button>
    `;
  } else {
    el.innerHTML = '';
  }
}

function showLandingView() {
  hideAllTopLevelViews();
  document.getElementById('public-view').style.display = 'block';
  hideAllPublicSections();
  document.getElementById('landing-section').style.display = 'block';
  setHeaderActions('loggedOut');
}

function showLoginForm() {
  hideAllTopLevelViews();
  document.getElementById('public-view').style.display = 'block';
  hideAllPublicSections();
  document.getElementById('login-section').style.display = 'block';
  setHeaderActions('form');
}

function showSetPasswordView() {
  hideAllTopLevelViews();
  document.getElementById('public-view').style.display = 'block';
  hideAllPublicSections();
  document.getElementById('set-password-section').style.display = 'block';
  setHeaderActions('form');
}

// ===== BRANDING =====
function applyDefaultBranding() {
  document.getElementById('brand-title').textContent = 'RFQ Hub';
  document.getElementById('brand-subtitle').textContent = 'Request for Quotation Management System';
  document.getElementById('hero-title').textContent = 'RFQ Hub';
  document.getElementById('hero-subtitle').textContent = DEFAULT_HERO_SUBTITLE;
  document.getElementById('brand-logo-img').style.display = 'none';
  document.getElementById('brand-logo-default').style.display = 'block';
}

function applyCompanyBranding(company, opts = {}) {
  if (!company) { applyDefaultBranding(); return; }

  document.getElementById('brand-title').textContent = company.name || 'RFQ Hub';
  document.getElementById('brand-subtitle').textContent = opts.subtitle || 'Request for Quotation Management System';
  document.getElementById('hero-title').textContent = opts.heroTitle || company.name || 'RFQ Hub';
  document.getElementById('hero-subtitle').textContent = opts.heroSubtitle || DEFAULT_HERO_SUBTITLE;

  const img = document.getElementById('brand-logo-img');
  const def = document.getElementById('brand-logo-default');
  if (company.logo_url) {
    img.src = company.logo_url;
    img.style.display = 'block';
    def.style.display = 'none';
  } else {
    img.style.display = 'none';
    def.style.display = 'block';
  }
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
  e.preventDefault();
  const password = document.getElementById('change-password-new').value;
  const confirmPassword = document.getElementById('change-password-confirm').value;

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
    document.getElementById('change-password-form').reset();
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

async function loadRFQDetails(rfqId) {
  try {
    const { data: rfq, error } = await client
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single();

    if (error || !rfq) {
      throw new Error('RFQ not found');
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
        heroSubtitle: `You've been invited to submit a quotation to ${company.name}.`
      });
    } else {
      applyDefaultBranding();
    }

    // Build contractor form
    let formHtml = `
      <div class="card">
        <h2 style="margin-top:0;">${rfq.rfq_name}</h2>
        <p style="color: var(--border); margin-bottom: 20px;">${rfq.description}</p>

        ${rfq.budget ? `<p><strong>Budget:</strong> R${rfq.budget.toLocaleString()}</p>` : ''}
        ${rfq.deadline ? `<p><strong>Deadline:</strong> ${new Date(rfq.deadline).toLocaleDateString()}</p>` : ''}

        ${rfq.required_documents && rfq.required_documents.length > 0 ? `
          <div style="margin: 20px 0;">
            <h4>Required Documents:</h4>
            <ul>
              ${rfq.required_documents.map(doc => `<li>${doc}</li>`).join('')}
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
            <p style="color: var(--border); font-size: 14px;">Optional: Upload any supporting documents</p>
            ${rfq.required_documents.map((doc, idx) => `
              <div style="margin-bottom: 15px;">
                <label>${doc}</label>
                <input type="file" id="doc-${idx}" accept=".pdf,.doc,.docx,.xls,.xlsx">
              </div>
            `).join('')}
          </div>

          <button type="submit" class="btn gold" style="width: 100%; padding: 15px; margin-top: 20px;">Submit Application</button>
        </form>
      </div>
    `;

    document.getElementById('rfq-portal').innerHTML = formHtml;

    document.getElementById('contractor-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const token = new URLSearchParams(window.location.search).get('rfq');
      submitContractorForm(token);
    });

  } catch (err) {
    console.error('Error loading RFQ details:', err);
    showToast('Error loading RFQ', 'error');
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

    // Upload files (optional - don't fail if this doesn't work)
    const fileInputs = document.querySelectorAll('[id^="doc-"]');
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

          await client.from('rfq_submission_documents').insert([{
            submission_id: submissionId,
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

    // Mark token as used
    await client
      .from('rfq_invitations')
      .update({ used: true })
      .eq('invitation_token', token);

    console.log('✅ Token marked as used');

    showToast('✅ Submission successful!', 'success');
    setTimeout(() => {
      document.getElementById('rfq-portal').innerHTML = '<div class="card"><h2 style="margin-top:0; color:var(--success);">Thank You!</h2><p>Your submission has been received.</p></div>';
    }, 1000);

  } catch (err) {
    console.error('Error submitting:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== ADMIN VIEW (Company Dashboard) =====
function showAdminView() {
  hideAllTopLevelViews();
  document.getElementById('admin-view').style.display = 'block';

  document.getElementById('admin-company-name').textContent = currentCompany ? currentCompany.name : 'RFQ Management';
  applyCompanyBranding(currentCompany, {
    heroTitle: currentCompany ? currentCompany.name : 'RFQ Hub',
    heroSubtitle: 'Manage your RFQs, contractor invitations, and submissions.'
  });

  const superLink = document.getElementById('super-admin-link');
  if (superLink) superLink.style.display = isSuperAdmin ? 'inline' : 'none';

  document.getElementById('create-tab').style.display = 'block';
  document.getElementById('console-tab').style.display = 'none';
  document.getElementById('submissions-tab').style.display = 'none';
  document.getElementById('settings-tab').style.display = 'none';

  document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });
}

function switchAdminTab(tabName, button) {
  document.querySelectorAll('.admin-tab').forEach(tab => tab.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabName + '-tab').style.display = 'block';
  if (button) button.classList.add('active');

  if (tabName === 'console') {
    loadRFQConsole();
  } else if (tabName === 'submissions') {
    loadSubmissions();
  } else if (tabName === 'settings') {
    loadSettingsTab();
    loadTeamMembers();
  }
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
  if (currentCompany.logo_url) {
    preview.src = currentCompany.logo_url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
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
}

function addDocumentField() {
  const builder = document.getElementById('required-docs-builder');
  const idx = builder.children.length;
  const field = document.createElement('div');
  field.style.cssText = 'display:flex; gap:10px; margin-bottom:10px;';
  field.innerHTML = `
    <input type="text" class="doc-field" placeholder="e.g., Insurance Certificate" style="flex:1; padding:8px; border:1px solid var(--border); border-radius:4px;">
    <button type="button" onclick="this.parentElement.remove()" class="btn secondary" style="padding:8px 12px;">Remove</button>
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

    const name = nameInput?.value?.trim() || '';
    const project = projectInput?.value?.trim() || '';
    const description = descInput?.value?.trim() || '';
    const deadline = deadlineInput?.value?.trim() || '';
    const budget = budgetInput?.value?.trim() || '';
    const emailsText = emailInput?.value?.trim() || '';

    const contractorEmails = emailsText
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.length > 0);

    const docInputs = document.querySelectorAll('.doc-field');
    const requiredDocs = Array.from(docInputs)
      .map(input => input.value ? input.value.trim() : '')
      .filter(val => val.length > 0);

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
    if (requiredDocs.length === 0) {
      showToast('❌ Please add at least one Required Document type', 'error');
      isSubmittingRFQ = false;
      return;
    }
    if (contractorEmails.length === 0) {
      showToast('❌ Please enter at least one Contractor Email', 'error');
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
        company_id: currentCompany.id
      }])
      .select()
      .single();

    if (rfqError || !rfq || !rfq.id) {
      throw new Error(rfqError ? rfqError.message : 'Failed to create RFQ');
    }

    console.log('✅ RFQ created:', rfq.id);

    await uploadRFQAttachments(rfq.id);

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

    for (const rfq of rfqs) {
      const { data: invitations } = await client
        .from('rfq_invitations')
        .select('*')
        .eq('rfq_id', rfq.id);

      const { data: submissions } = await client
        .from('rfq_submissions')
        .select('*')
        .eq('rfq_id', rfq.id);

      const deadlineDate = new Date(rfq.deadline);
      const isExpired = deadlineDate < new Date();
      const daysLeft = Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24));
      const submissionCount = submissions ? submissions.length : 0;
      const invitationCount = invitations ? invitations.length : 0;
      const responseRate = invitationCount > 0 ? Math.round((submissionCount / invitationCount) * 100) : 0;

      consoleHtml += `
        <div class="rfq-console-card ${isExpired ? 'expired' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
            <div style="flex: 1;">
              <h3 style="margin: 0 0 5px 0; color: var(--primary);">${rfq.rfq_name}</h3>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: var(--border);">Project: <strong>${rfq.project_name}</strong></p>
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
                ${rfq.required_documents.map(doc => `<li style="margin-bottom: 5px;">${doc}</li>`).join('')}
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

    const { data: submissions, error } = await client
      .from('rfq_submissions')
      .select(`*, rfqs!inner(rfq_name, company_id)`)
      .eq('rfqs.company_id', currentCompany.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('Submissions loaded:', submissions ? submissions.length : 0);

    if (!submissions || submissions.length === 0) {
      document.getElementById('submissions-list').innerHTML = '<p style="text-align: center; color: var(--border); padding: 40px;">No submissions yet</p>';
      return;
    }

    const listHtml = submissions.map(sub => `
      <div class="submission-card" onclick="openSubmissionDetail('${sub.id}')">
        <h3 style="margin: 0 0 10px 0; color: var(--ink);">${sub.contractor_name}</h3>
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
      ? documents.map(doc => `
          <div style="padding: 8px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--ink);">📄 ${doc.file_name}</span>
            <button onclick="downloadDocument('${doc.file_path}', '${doc.file_name}')"
              class="btn" style="padding: 4px 12px; font-size: 12px;">
              Download
            </button>
          </div>
        `).join('')
      : '<p style="color: var(--border); font-style: italic;">No documents submitted</p>';

    const detailsContent = document.getElementById('submission-details-content');
    const docsContent = document.getElementById('submission-documents-list');

    if (detailsContent) detailsContent.innerHTML = detailsHtml;
    if (docsContent) docsContent.innerHTML = docsHtml;

    const statusSelect = document.getElementById('submission-status-update');
    if (statusSelect) {
      statusSelect.value = submission.status;
      statusSelect.dataset.submissionId = id;
    }

    const title = document.getElementById('submission-title');
    if (title) title.textContent = submission.contractor_name;

    openModal('submission-detail-modal');

  } catch (err) {
    console.error('Error opening submission detail:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function updateSubmissionStatus() {
  try {
    const statusSelect = document.getElementById('submission-status-update');
    if (!statusSelect || !statusSelect.dataset.submissionId) {
      showToast('Error: submission ID not found', 'error');
      return;
    }

    const id = statusSelect.dataset.submissionId;
    const newStatus = statusSelect.value;

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

  loadSuperAdminCompanies();
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

function acceptPOPIA() {
  closeModal('popia-modal');
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, initializing...');
  setupCreateRFQForm();
});
