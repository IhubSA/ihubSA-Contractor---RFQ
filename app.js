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
  switchAdminTab('create');
}

function logoutAdmin() {
  localStorage.removeItem('cnwe_admin_logged_in');
  currentUser = null;
  location.reload();
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(tab => tab.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById(tabName + '-tab').style.display = 'block';
  event.target.classList.add('active');

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

async function createNewRFQ() {
  try {
    const name = document.getElementById('rfq-name').value.trim();
    const project = document.getElementById('rfq-project').value.trim();
    const description = document.getElementById('rfq-description').value.trim();
    const deadline = document.getElementById('rfq-deadline').value;
    const budget = document.getElementById('rfq-budget').value.trim();
    const contractorEmails = document.getElementById('contractor-emails').value
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.length > 0);

    // Get required documents from form
    const docInputs = document.querySelectorAll('.doc-field');
    const requiredDocs = Array.from(docInputs)
      .map(input => input.value.trim())
      .filter(val => val.length > 0);

    // Validate
    if (!name || !project || !description || !deadline) {
      showToast('Please fill in all RFQ details', 'error');
      return;
    }

    if (requiredDocs.length === 0) {
      showToast('Please add at least one required document type', 'error');
      return;
    }

    if (contractorEmails.length === 0) {
      showToast('Please enter at least one contractor email', 'error');
      return;
    }

    showToast('Creating RFQ...', 'success');

    // Create RFQ in database
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

    if (rfqError) throw rfqError;

    console.log('✅ RFQ created:', rfq.id);

    // Generate unique tokens and create invitations
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

    // Show generated links
    showGeneratedLinks(rfq.id, invitations);

    // Reset form
    document.getElementById('create-rfq-form').reset();
    document.getElementById('required-docs-builder').innerHTML = '';

  } catch (err) {
    console.error('Error creating RFQ:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

function generateToken() {
  return 'token-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
}

function showGeneratedLinks(rfqId, invitations) {
  const baseUrl = window.location.origin + window.location.pathname;
  const linksHtml = invitations.map(inv => {
    const link = `${baseUrl}?rfq=${inv.invitation_token}`;
    return `<strong>${inv.contractor_email}</strong><br>${link}<br><br>`;
  }).join('');

  document.getElementById('generated-links-list').innerHTML = linksHtml;
  openModal('generated-links-modal');
  showToast('✅ RFQ created successfully!', 'success');
}

async function loadSubmissions() {
  console.log('Load submissions');
}

function filterSubmissions() {
  console.log('Filter submissions');
}

async function openSubmissionDetail(id) {
  console.log('Open submission:', id);
}

async function updateSubmissionStatus() {
  console.log('Update status');
}

async function downloadDocument(path, name) {
  console.log('Download:', name);
}

function copyAllLinks() {
  console.log('Copy links');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Set up Create RFQ form listener
function setupCreateRFQForm() {
  const form = document.getElementById('create-rfq-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await createNewRFQ();
    };
  }
}

setTimeout(setupCreateRFQForm, 100);
