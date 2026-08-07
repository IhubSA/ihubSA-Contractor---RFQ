// CNWE RFQ System - Application Logic
const SUPABASE_URL = 'https://zilumoopwnrtrtnsmjhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbHVtb29wd25ydHJ0bnNtamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTU2MzgsImV4cCI6MjEwMTY3MTYzOH0.t8aQkOU29pwG9fwW9BlTwd4oie2jxkZa43mb3yc55kg';

let client = null;
let currentUser = null;
let currentRFQId = null;
let popiAcknowledged = false;

// Initialize app when page loads
function initApp() {
  console.log('Initializing RFQ System...');
  
  try {
    // Create Supabase client
    client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase connected');
  } catch(err) {
    console.error('Error connecting to Supabase:', err);
    showToast('Error connecting to system', 'error');
    return;
  }

  // Check URL parameters for RFQ token
  const params = new URLSearchParams(window.location.search);
  const rfqToken = params.get('rfq');

  if (rfqToken) {
    // Contractor portal view
    console.log('Loading RFQ with token:', rfqToken);
    loadContractorView(rfqToken);
  } else {
    // Check if admin is logged in
    checkAdminLogin();
  }
}

// ===== CONTRACTOR VIEW =====
async function loadContractorView(token) {
  try {
    document.getElementById('public-view').style.display = 'block';
    document.getElementById('admin-view').style.display = 'none';

    // Get RFQ from token
    const { data: invitation, error: invError } = await client
      .from('rfq_invitations')
      .select('rfq_id, contractor_email, used')
      .eq('invitation_token', token)
      .single();

    if (invError || !invitation) {
      console.error('RFQ not found:', invError);
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').style.display = 'block';
      return;
    }

    if (invitation.used) {
      showToast('This link has already been used', 'error');
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').style.display = 'block';
      return;
    }

    currentRFQId = invitation.rfq_id;
    document.getElementById('contractor-email').value = invitation.contractor_email;

    // Load RFQ details
    await loadRFQDetails(invitation.rfq_id);

    document.getElementById('rfq-portal').style.display = 'block';
    document.getElementById('no-rfq-message').style.display = 'none';

    // Set up form submission
    document.getElementById('submission-form').onsubmit = async (e) => {
      e.preventDefault();
      if (!popiAcknowledged) {
        showPopiModal();
        return;
      }
      await submitContractorForm(token);
    };

  } catch (err) {
    console.error('Error loading RFQ:', err);
    showToast('Error loading RFQ: ' + err.message, 'error');
  }
}

async function loadRFQDetails(rfqId) {
  try {
    const { data: rfq, error } = await client
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single();

    if (error || !rfq) throw new Error('RFQ not found');

    document.getElementById('rfq-title').textContent = rfq.rfq_name;
    document.getElementById('rfq-project').textContent = rfq.project_name;
    document.getElementById('rfq-description').textContent = rfq.description;
    document.getElementById('rfq-deadline').textContent = new Date(rfq.deadline).toLocaleString('en-ZA');

    // Show required documents
    const docsList = document.getElementById('required-docs-list');
    docsList.innerHTML = '';
    const uploadsContainer = document.getElementById('document-uploads-container');
    uploadsContainer.innerHTML = '';

    if (rfq.required_documents && rfq.required_documents.length > 0) {
      rfq.required_documents.forEach((doc, idx) => {
        docsList.innerHTML += `<div style="margin-bottom:8px;"><input type="checkbox" disabled checked> ${doc}</div>`;
        uploadsContainer.innerHTML += `
          <div class="document-upload-item">
            <label style="flex:1;">${doc}</label>
            <input type="file" id="doc-${idx}" data-doc-name="${doc}" accept=".pdf,.docx,.xlsx" required>
          </div>
        `;
      });
    }
  } catch (err) {
    console.error('Error loading RFQ details:', err);
    showToast('Error loading RFQ details', 'error');
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

    // Create submission
    const { data: submission, error: subError } = await client
      .from('rfq_submissions')
      .insert([{
        rfq_id: currentRFQId,
        contractor_name: name,
        contractor_email: email,
        contractor_phone: phone,
        contractor_reg: reg,
        status: 'submitted'
      }])
      .select()
      .single();

    if (subError) throw subError;

    console.log('✅ Submission created:', submission.id);

    // Upload files (optional - don't fail if this doesn't work)
    const fileInputs = document.querySelectorAll('[id^="doc-"]');
    let filesUploaded = 0;
    let filesSkipped = 0;

    for (let input of fileInputs) {
      if (input.files[0]) {
        try {
          const file = input.files[0];
          const filePath = `rfq-${currentRFQId}/sub-${submission.id}/${Date.now()}-${file.name}`;
          
          console.log('Attempting to upload:', file.name);
          
          const { error: uploadError } = await client.storage
            .from('rfq-documents')
            .upload(filePath, file);

          if (uploadError) {
            console.warn('⚠️ File upload failed for', file.name, ':', uploadError.message);
            filesSkipped++;
            continue;
          }

          await client.from('rfq_submission_documents').insert([{
            submission_id: submission.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size
          }]);

          filesUploaded++;
          console.log('✅ File uploaded:', file.name);

        } catch (fileErr) {
          console.warn('⚠️ Error uploading file:', fileErr.message);
          filesSkipped++;
          // Continue with other files
        }
      }
    }

    console.log(`📊 Upload summary: ${filesUploaded} uploaded, ${filesSkipped} skipped`);

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

// ===== ADMIN VIEW =====
function checkAdminLogin() {
  document.getElementById('public-view').style.display = 'block';
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('rfq-portal').style.display = 'none';
  document.getElementById('no-rfq-message').style.display = 'block';
  document.getElementById('no-rfq-message').innerHTML = `<div class="card"><h2 style="margin-top:0;">RFQ Portal</h2><p>Click "Staff login" to access admin features.</p></div>`;
}

function goToAdminLogin(e) {
  e.preventDefault();
  promptAdminLogin();
}

function promptAdminLogin() {
  const password = prompt('Enter admin password:');
  if (password === 'CNWE2026') {
    currentUser = { id: 'admin' };
    localStorage.setItem('cnwe_admin_logged_in', 'true');
    showAdminView();
  } else if (password) {
    showToast('Incorrect password', 'error');
  }
}

function showAdminView() {
  document.getElementById('public-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'block';
  
  // Set create tab as active
  document.getElementById('create-tab').style.display = 'block';
  document.getElementById('submissions-tab').style.display = 'none';
  document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });
}

function logoutAdmin() {
  localStorage.removeItem('cnwe_admin_logged_in');
  currentUser = null;
  location.reload();
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
  }
}

// ===== UTILITY FUNCTIONS =====
function showToast(message, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function showPopiModal() {
  openModal('popia-modal');
}

function acknowledgePopia() {
  popiAcknowledged = true;
  closeModal('popia-modal');
  document.getElementById('submission-form').dispatchEvent(new Event('submit'));
}

// Admin stub functions
function addDocumentField() {
  const container = document.getElementById('required-docs-builder');
  const index = container.children.length;
  const wrapper = document.createElement('div');
  wrapper.className = 'doc-field-wrapper';
  wrapper.innerHTML = `
    <input type="text" placeholder="e.g., Insurance Certificate" class="doc-field">
    <button type="button" onclick="removeDocumentField(this)">Remove</button>
  `;
  container.appendChild(wrapper);
}

function removeDocumentField(button) {
  button.parentElement.remove();
}

function resetCreateForm() {
  document.getElementById('create-rfq-form').reset();
}

function resetSubmissionForm() {
  document.getElementById('submission-form').reset();
}

let isSubmittingRFQ = false;
let lastInvitations = [];

async function createNewRFQ() {
  // Prevent double submission
  if (isSubmittingRFQ) {
    console.log('⏳ Already submitting, please wait...');
    return;
  }

  isSubmittingRFQ = true;

  try {
    console.log('=== CREATE RFQ STARTED ===');
    
    // Get fields by name attribute (not ID)
    const nameInput = document.querySelector('input[name="rfq_name"]');
    const projectInput = document.querySelector('input[name="rfq_project"]');
    const descInput = document.querySelector('textarea[name="rfq_description"]');
    const deadlineInput = document.querySelector('input[name="rfq_deadline"]');
    const budgetInput = document.querySelector('input[name="rfq_budget"]');
    const emailInput = document.querySelector('textarea[name="contractor_emails"]');

    console.log('✅ Found all input fields by name');

    const name = nameInput?.value?.trim() || '';
    const project = projectInput?.value?.trim() || '';
    const description = descInput?.value?.trim() || '';
    const deadline = deadlineInput?.value?.trim() || '';
    const budget = budgetInput?.value?.trim() || '';
    const emailsText = emailInput?.value?.trim() || '';

    console.log('📋 Values captured:');
    console.log('  Name:', name);
    console.log('  Project:', project);
    console.log('  Description:', description);
    console.log('  Deadline:', deadline);
    console.log('  Emails:', emailsText);

    const contractorEmails = emailsText
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.length > 0);

    console.log('  Email count:', contractorEmails.length);

    // Get required documents
    const docInputs = document.querySelectorAll('.doc-field');
    console.log('🔍 Document fields search:');
    console.log('  - Elements with .doc-field class:', docInputs.length);
    Array.from(docInputs).forEach((input, idx) => {
      console.log(`    Doc ${idx}: value="${input.value}", trimmed="${input.value ? input.value.trim() : ''}"`);
    });

    const requiredDocs = Array.from(docInputs)
      .map(input => input.value ? input.value.trim() : '')
      .filter(val => val.length > 0);

    console.log('📋 Final required docs array:', requiredDocs, '(length:', requiredDocs.length + ')');

    // Validate
    if (!name) {
      showToast('❌ Please enter RFQ Name', 'error');
      return;
    }
    if (!project) {
      showToast('❌ Please enter Project Name', 'error');
      return;
    }
    if (!description) {
      showToast('❌ Please enter Description', 'error');
      return;
    }
    if (!deadline) {
      showToast('❌ Please select a Deadline', 'error');
      return;
    }

    if (requiredDocs.length === 0) {
      showToast('❌ Please add at least one Required Document type by clicking "+ Add Document Type"', 'error');
      return;
    }

    if (contractorEmails.length === 0) {
      showToast('❌ Please enter at least one Contractor Email', 'error');
      return;
    }

    console.log('✅ All validations passed');
    showToast('Creating RFQ in database...', 'success');

    // Create RFQ in database
    console.log('Attempting to insert RFQ:', {
      rfq_name: name,
      project_name: project,
      description: description,
      deadline: deadline,
      budget: budget || null,
      required_documents: requiredDocs,
      created_by: 'admin'
    });

    const { data: rfq, error: rfqError } = await client
      .from('rfqs')
      .insert([{
        rfq_name: name,
        project_name: project,
        description: description,
        deadline: deadline,
        budget: budget || null,
        required_documents: requiredDocs,
        created_by: 'admin'
      }])
      .select()
      .single();

    if (rfqError) {
      console.error('❌ RFQ creation error:', rfqError);
      throw new Error('Failed to create RFQ: ' + JSON.stringify(rfqError));
    }

    if (!rfq || !rfq.id) {
      console.error('❌ RFQ created but no ID returned');
      throw new Error('RFQ created but no ID returned');
    }

    console.log('✅ RFQ created successfully:', rfq.id);
    showToast('RFQ created! Now creating invitations...', 'success');

    // Generate unique tokens and create invitations
    const invitations = contractorEmails.map(email => ({
      rfq_id: rfq.id,
      contractor_email: email,
      invitation_token: generateToken(),
      used: false
    }));

    console.log('Attempting to insert invitations:', invitations);

    const { error: invError } = await client
      .from('rfq_invitations')
      .insert(invitations);

    if (invError) {
      console.error('❌ Invitation creation error:', invError);
      throw new Error('Failed to create invitations: ' + JSON.stringify(invError));
    }

    console.log('✅ Invitations created successfully');
    showToast('✅ RFQ and invitations created!', 'success');

    // Show generated links
    showGeneratedLinks(rfq.id, invitations);

    // Reset form
    document.getElementById('create-rfq-form').reset();
    const builderContainer = document.getElementById('required-docs-builder');
    if (builderContainer) builderContainer.innerHTML = '';

    console.log('✅ RFQ creation process completed successfully');

  } catch (err) {
    console.error('❌ Error creating RFQ:', err);
    showToast('Error: ' + err.message, 'error');
  } finally {
    isSubmittingRFQ = false;
  }
}

function generateToken() {
  return 'token-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
}

function showGeneratedLinks(rfqId, invitations) {
  console.log('Showing generated links for RFQ:', rfqId);
  
  // Store for copy function
  window.lastInvitations = invitations;
  
  const baseUrl = window.location.origin + window.location.pathname;
  console.log('Base URL:', baseUrl);
  
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
  if (linksContainer) {
    linksContainer.innerHTML = linksHtml;
    console.log('✅ Links HTML set in modal');
  } else {
    console.error('❌ generated-links-list container not found');
    return;
  }

  openModal('generated-links-modal');
  console.log('✅ Modal opened');
}

async function loadSubmissions() {
  try {
    console.log('Loading submissions...');
    
    const { data: submissions, error } = await client
      .from('rfq_submissions')
      .select(`
        id,
        rfq_id,
        contractor_name,
        contractor_email,
        status,
        created_at,
        rfqs(rfq_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading submissions:', error);
      throw error;
    }

    console.log('Submissions loaded:', submissions);

    // Populate RFQ filter dropdown
    const rfqs = new Map();
    if (submissions && submissions.length > 0) {
      submissions.forEach(sub => {
        if (sub.rfqs) rfqs.set(sub.rfq_id, sub.rfqs.rfq_name);
      });
    }

    const filterSelect = document.getElementById('rfq-filter');
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">All RFQs</option>';
      rfqs.forEach((name, id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        filterSelect.appendChild(option);
      });
    }

    // Display submissions
    const container = document.getElementById('submissions-list');
    if (!submissions || submissions.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:var(--ink-2);">No submissions yet</p>';
      return;
    }

    container.innerHTML = submissions.map(sub => `
      <div class="submission-card" onclick="openSubmissionDetail('${sub.id}')">
        <div class="submission-card-info">
          <h4>${sub.contractor_name}</h4>
          <p><strong>Email:</strong> ${sub.contractor_email}</p>
          <p><strong>RFQ:</strong> ${sub.rfqs?.rfq_name || 'Unknown'}</p>
          <p><strong>Submitted:</strong> ${new Date(sub.created_at).toLocaleString('en-ZA')}</p>
        </div>
        <div class="submission-status ${sub.status}">${sub.status}</div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Error in loadSubmissions:', err);
    showToast('Error loading submissions: ' + err.message, 'error');
  }
}

async function loadRFQConsole() {
  try {
    console.log('Loading RFQ Console...');
    
    // Fetch all RFQs
    const { data: rfqs, error: rfqError } = await client
      .from('rfqs')
      .select('*')
      .order('created_at', { ascending: false });

    if (rfqError) {
      console.error('Error loading RFQs:', rfqError);
      showToast('Error loading RFQs', 'error');
      return;
    }

    console.log('RFQs loaded:', rfqs.length);

    if (!rfqs || rfqs.length === 0) {
      document.getElementById('rfq-console-list').innerHTML = 
        '<div style="text-align: center; padding: 40px; color: var(--border);"><p>No active RFQs yet. <strong>Create one to get started!</strong></p></div>';
      return;
    }

    // Build console HTML
    let consoleHtml = '';
    const baseUrl = window.location.origin + window.location.pathname;

    for (const rfq of rfqs) {
      // Fetch invitations for this RFQ
      const { data: invitations } = await client
        .from('rfq_invitations')
        .select('*')
        .eq('rfq_id', rfq.id);

      // Fetch submissions for this RFQ
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
        <div class="card" style="border-left: 4px solid ${isExpired ? 'var(--warning)' : 'var(--accent)'};">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
            <div style="flex: 1;">
              <h3 style="margin: 0 0 5px 0; color: var(--ink);">${rfq.rfq_name}</h3>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: var(--border);">Project: <strong>${rfq.project_name}</strong></p>
              <p style="margin: 0; font-size: 14px; color: var(--border);">
                Deadline: ${deadlineDate.toLocaleDateString()} at ${deadlineDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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

          <!-- Description & Budget -->
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

          <!-- Required Documents -->
          ${rfq.required_documents && rfq.required_documents.length > 0 ? `
            <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px;">
              <h4 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: var(--border); font-weight: bold;">Required Documents</h4>
              <ul style="margin: 0; padding-left: 20px; color: var(--ink);">
                ${rfq.required_documents.map(doc => `<li style="margin-bottom: 5px;">${doc}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <!-- Contractor Links -->
          <div style="background: var(--bg-2); padding: 15px; border-radius: 4px; margin-bottom: 15px;">
            <h4 style="margin-top: 0; margin-bottom: 10px; color: var(--ink);">Contractor Links (${invitationCount})</h4>
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto;">
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

          <!-- Actions -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button onclick="showAddContractorForm('${rfq.id}')" class="btn secondary" style="padding: 10px;">
              + Add Contractor
            </button>
            <button onclick="copyAllRFQLinks('${rfq.id}')" class="btn" style="padding: 10px;">
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

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('✅ Link copied!', 'success');
  }).catch(() => {
    showToast('Error copying to clipboard', 'error');
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
      showToast('Error copying to clipboard', 'error');
    });
  } catch (err) {
    console.error('Error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function showAddContractorForm(rfqId) {
  const email = prompt('Enter contractor email:');
  if (!email) return;

  try {
    console.log('Adding contractor to RFQ:', rfqId);
    
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

    if (error) {
      console.error('Error adding contractor:', error);
      showToast('Error: ' + error.message, 'error');
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?rfq=${inv.invitation_token}`;
    
    showToast('✅ Contractor added! Link copied to clipboard.', 'success');
    navigator.clipboard.writeText(link);
    
    // Reload console
    loadRFQConsole();

  } catch (err) {
    console.error('Error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

function filterSubmissions() {
  console.log('Filtering submissions...');
  loadSubmissions();
}

async function openSubmissionDetail(id) {
  console.log('Opening submission:', id);
  
  try {
    // Fetch submission details
    const { data: submission, error: subError } = await client
      .from('rfq_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (subError || !submission) {
      console.error('Error loading submission:', subError);
      showToast('Error loading submission', 'error');
      return;
    }

    console.log('Submission loaded:', submission);

    // Fetch RFQ details
    const { data: rfq } = await client
      .from('rfqs')
      .select('*')
      .eq('id', submission.rfq_id)
      .single();

    // Fetch submission documents
    const { data: documents } = await client
      .from('rfq_submission_documents')
      .select('*')
      .eq('submission_id', id);

    console.log('Documents:', documents);

    // Build HTML for submission details
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

    // Build documents HTML
    let docsHtml = '';
    if (documents && documents.length > 0) {
      docsHtml = documents.map(doc => `
        <div style="padding: 8px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--ink);">📄 ${doc.file_name}</span>
          <button onclick="downloadDocument('${doc.file_path}', '${doc.file_name}')" 
            class="btn" style="padding: 4px 12px; font-size: 12px;">
            Download
          </button>
        </div>
      `).join('');
    } else {
      docsHtml = '<p style="color: var(--border); font-style: italic;">No documents submitted</p>';
    }

    // Set content in modals
    const detailsContent = document.getElementById('submission-details-content');
    if (detailsContent) detailsContent.innerHTML = detailsHtml;

    const docsContent = document.getElementById('submission-documents-list');
    if (docsContent) docsContent.innerHTML = docsHtml;

    // Set status dropdown
    const statusSelect = document.getElementById('submission-status-update');
    if (statusSelect) {
      statusSelect.value = submission.status;
      // Store ID for update function
      statusSelect.dataset.submissionId = id;
    }

    // Update modal title
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
    console.log('Updating submission', id, 'to status:', newStatus);

    const { error } = await client
      .from('rfq_submissions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating status:', error);
      showToast('Error updating status', 'error');
      return;
    }

    showToast('✅ Status updated successfully!', 'success');
    closeModal('submission-detail-modal');
    
    // Reload submissions to show updated status
    loadSubmissions();

  } catch (err) {
    console.error('Error in updateSubmissionStatus:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function downloadDocument(path, name) {
  try {
    console.log('Downloading document:', name, 'from path:', path);
    
    // Try to get public URL from storage
    try {
      const { data } = client.storage.from('rfq-documents').getPublicUrl(path);
      if (data && data.publicUrl) {
        // Create a link and click it to download
        const link = document.createElement('a');
        link.href = data.publicUrl;
        link.download = name;
        link.click();
        showToast('✅ Download started', 'success');
        return;
      }
    } catch (storageErr) {
      console.log('Storage download attempt failed, trying alternative...');
    }

    // Fallback: show message
    showToast('Document: ' + name, 'info');
    console.log('Document path:', path);

  } catch (err) {
    console.error('Error downloading document:', err);
    showToast('Error downloading document', 'error');
  }
}

function copyAllLinks() {
  if (!window.lastInvitations || window.lastInvitations.length === 0) {
    showToast('No links to copy', 'error');
    return;
  }

  const baseUrl = window.location.origin + window.location.pathname;
  
  // Copy only the URLs, one per line
  const links = window.lastInvitations.map(inv => {
    return `${baseUrl}?rfq=${inv.invitation_token}`;
  }).join('\n');

  navigator.clipboard.writeText(links).then(() => {
    showToast('✅ URLs copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - starting app initialization');
    initApp();
    setupCreateRFQForm();
  });
} else {
  console.log('DOM already loaded - starting app initialization');
  initApp();
  setupCreateRFQForm();
}

// Set up Create RFQ form listener
function setupCreateRFQForm() {
  setTimeout(() => {
    const form = document.getElementById('create-rfq-form');
    if (form) {
      console.log('✅ Create RFQ form found and hooked up');
      form.onsubmit = async (e) => {
        e.preventDefault();
        console.log('Form submitted - calling createNewRFQ');
        await createNewRFQ();
      };
    } else {
      console.error('❌ Create RFQ form NOT found in DOM');
    }
  }, 100);
}
