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

    // Upload files
    const fileInputs = document.querySelectorAll('[id^="doc-"]');
    for (let input of fileInputs) {
      if (input.files[0]) {
        const file = input.files[0];
        const filePath = `rfq-${currentRFQId}/sub-${submission.id}/${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await client.storage
          .from('rfq-documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        await client.from('rfq_submission_documents').insert([{
          submission_id: submission.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size
        }]);
      }
    }

    // Mark token as used
    await client
      .from('rfq_invitations')
      .update({ used: true })
      .eq('invitation_token', token);

    showToast('Submission successful!', 'success');
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

  if (tabName === 'submissions') {
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

function filterSubmissions() {
  console.log('Filtering submissions...');
  loadSubmissions();
}

async function openSubmissionDetail(id) {
  console.log('Open submission:', id);
  showToast('Feature coming soon', 'info');
}

async function updateSubmissionStatus() {
  console.log('Update status');
  showToast('Feature coming soon', 'info');
}

async function downloadDocument(path, name) {
  console.log('Download:', name);
  showToast('Feature coming soon', 'info');
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
