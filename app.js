// RFQ Hub Application Logic — Supabase Integration
// CONFIGURATION
const SUPABASE_URL = 'https://zilumoopwnrtrtnsmjhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbHVtb29wd25ydHJ0bnNtamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTU2MzgsImV4cCI6MjEwMTY3MTYzOH0.t8aQkOU29pwG9fwW9BlTwd4oie2jxkZa43mb3yc55kg';
var sbClient;

// ===== STATE =====
let currentUser = null;
let currentRFQId = null;
let currentSubmissionId = null;
let popiAcknowledged = false;
let requiredDocuments = [];
let documentFields = [];

// ===== INITIALIZATION =====
async function initApp() {
  // Initialize Supabase
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Check if user is viewing RFQ via unique link
  const urlParams = new URLSearchParams(window.location.search);
  const rfqToken = urlParams.get('rfq');

  if (rfqToken) {
    // Contractor view
    showPublicView();
    await loadRFQFromToken(rfqToken);
  } else {
    // Check if admin is logged in
    checkAdminSession();
  }
}

async function checkAdminSession() {
  const adminId = localStorage.getItem('cnwe_admin_id');
  const adminToken = localStorage.getItem('cnwe_admin_token');

  if (adminId && adminToken) {
    currentUser = { id: adminId };
    showAdminView();
    loadAdminDashboard();
  } else {
    showPublicView();
  }
}

// ===== VIEW MANAGEMENT =====
function showPublicView() {
  document.getElementById('public-view').style.display = 'block';
  document.getElementById('admin-view').style.display = 'none';
}

function showAdminView() {
  document.getElementById('public-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'block';
  switchAdminTab('create');
}

function goToAdminLogin(e) {
  e.preventDefault();
  promptAdminLogin();
}

function promptAdminLogin() {
  const password = prompt('Enter admin password:');
  if (password) {
    // Simple password validation (in production, use proper auth)
    if (password === 'CNWE2026') {
      currentUser = { id: 'admin_' + Date.now() };
      localStorage.setItem('cnwe_admin_id', currentUser.id);
      localStorage.setItem('cnwe_admin_token', 'token_' + Date.now());
      showAdminView();
      loadAdminDashboard();
      showToast('Admin logged in successfully', 'success');
    } else {
      showToast('Incorrect password', 'error');
    }
  }
}

function logoutAdmin() {
  localStorage.removeItem('cnwe_admin_id');
  localStorage.removeItem('cnwe_admin_token');
  currentUser = null;
  location.reload();
}

// ===== CONTRACTOR VIEW =====
async function loadRFQFromToken(token) {
  try {
    const { data, error } = await sbClient
      .from('rfq_invitations')
      .select('rfq_id, contractor_email, used')
      .eq('invitation_token', token)
      .single();

    if (error || !data) {
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').style.display = 'block';
      return;
    }

    if (data.used) {
      showToast('This link has already been used', 'error');
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').style.display = 'block';
      return;
    }

    currentRFQId = data.rfq_id;
    await loadRFQDetails(data.rfq_id);
    document.getElementById('rfq-portal').style.display = 'block';
    document.getElementById('no-rfq-message').style.display = 'none';

    // Pre-fill contractor email
    document.getElementById('contractor-email').value = data.contractor_email;

    // Set up form submission
    document.getElementById('submission-form').onsubmit = async (e) => {
      e.preventDefault();
      if (!popiAcknowledged) {
        showPopiModal();
        return;
      }
      await submitContractorResponse(token);
    };
  } catch (err) {
    console.error('Error loading RFQ:', err);
    showToast('Error loading RFQ', 'error');
  }
}

async function loadRFQDetails(rfqId) {
  try {
    const { data: rfq, error } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single();

    if (error || !rfq) {
      throw new Error('RFQ not found');
    }

    document.getElementById('rfq-title').textContent = rfq.rfq_name;
    document.getElementById('rfq-project').textContent = rfq.project_name;
    document.getElementById('rfq-description').textContent = rfq.description;
    document.getElementById('rfq-deadline').textContent = new Date(rfq.deadline).toLocaleString('en-ZA');

    // Build required documents list
    requiredDocuments = rfq.required_documents || [];
    const docsList = document.getElementById('required-docs-list');
    docsList.innerHTML = '';
    requiredDocuments.forEach(doc => {
      const li = document.createElement('div');
      li.style.marginBottom = '8px';
      li.innerHTML = `<input type="checkbox" disabled checked> ${doc}`;
      docsList.appendChild(li);
    });

    // Build document upload fields
    const uploadsContainer = document.getElementById('document-uploads-container');
    uploadsContainer.innerHTML = '';
    requiredDocuments.forEach((doc, index) => {
      const div = document.createElement('div');
      div.className = 'document-upload-item';
      div.innerHTML = `
        <label style="flex:1;">${doc}</label>
        <input type="file" id="doc-${index}" data-doc-name="${doc}" accept=".pdf,.docx,.xlsx">
        <span id="status-${index}" style="font-size:12px; color:var(--ink-2);"></span>
      `;
      uploadsContainer.appendChild(div);
    });
  } catch (err) {
    console.error('Error loading RFQ details:', err);
    showToast('Error loading RFQ details', 'error');
  }
}

async function submitContractorResponse(token) {
  try {
    // Validate form
    const name = document.getElementById('contractor-name').value;
    const email = document.getElementById('contractor-email').value;
    const phone = document.getElementById('contractor-phone').value;
    const reg = document.getElementById('contractor-reg').value;

    if (!name || !email) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    // Check if all required documents are uploaded
    const fileInputs = document.querySelectorAll('[id^="doc-"]');
    const uploadedFiles = [];

    for (let input of fileInputs) {
      if (!input.files.length) {
        showToast(`Please upload ${input.dataset.docName}`, 'error');
        return;
      }
      uploadedFiles.push(input.files[0]);
    }

    showToast('Uploading documents...', 'success');

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('rfq_submissions')
      .insert([{
        rfq_id: currentRFQId,
        contractor_name: name,
        contractor_email: email,
        contractor_phone: phone,
        contractor_reg: reg,
        status: 'submitted',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (submissionError) throw submissionError;

    currentSubmissionId = submission.id;

    // Upload files to Supabase Storage
    for (let file of uploadedFiles) {
      const filePath = `rfq-${currentRFQId}/submission-${submission.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await sbClient.storage
        .from('rfq-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Record file metadata
      await supabase
        .from('rfq_submission_documents')
        .insert([{
          submission_id: submission.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          uploaded_at: new Date().toISOString()
        }]);
    }

    // Mark invitation as used
    await supabase
      .from('rfq_invitations')
      .update({ used: true })
      .eq('invitation_token', token);

    showToast('Submission successful! Your documents have been received.', 'success');
    setTimeout(() => {
      document.getElementById('submission-form').reset();
      document.getElementById('rfq-portal').style.display = 'none';
      document.getElementById('no-rfq-message').innerHTML = `
        <div class="card">
          <h2 style="margin-top:0; color:var(--success);">Thank you!</h2>
          <p>Your submission has been received and is now under review. The CNWE contracts team will contact you shortly.</p>
        </div>
      `;
    }, 1500);
  } catch (err) {
    console.error('Error submitting response:', err);
    showToast('Error submitting documents: ' + err.message, 'error');
  }
}

function resetSubmissionForm() {
  document.getElementById('submission-form').reset();
  popiAcknowledged = false;
}

// ===== ADMIN DASHBOARD =====
function switchAdminTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.style.display = 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  document.getElementById(tabName + '-tab').style.display = 'block';
  event.target.classList.add('active');

  if (tabName === 'submissions') {
    loadSubmissions();
  }
}

// ===== CREATE RFQ FORM =====
function addDocumentField() {
  const container = document.getElementById('required-docs-builder');
  const index = documentFields.length;
  const wrapper = document.createElement('div');
  wrapper.className = 'doc-field-wrapper';
  wrapper.innerHTML = `
    <input type="text" placeholder="e.g., Insurance Certificate" class="doc-field" data-index="${index}">
    <button type="button" onclick="removeDocumentField(${index})">Remove</button>
  `;
  container.appendChild(wrapper);
  documentFields.push({ index, wrapper });
}

function removeDocumentField(index) {
  const field = documentFields.find(f => f.index === index);
  if (field) {
    field.wrapper.remove();
    documentFields = documentFields.filter(f => f.index !== index);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const createForm = document.getElementById('create-rfq-form');
  if (createForm) {
    createForm.onsubmit = async (e) => {
      e.preventDefault();
      await createNewRFQ();
    };
  }
});

async function createNewRFQ() {
  try {
    const name = document.getElementById('rfq-name').value;
    const project = document.getElementById('rfq-project').value;
    const description = document.getElementById('rfq-description').value;
    const deadline = document.getElementById('rfq-deadline').value;
    const budget = document.getElementById('rfq-budget').value;
    const contractorEmails = document.getElementById('contractor-emails').value
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.length > 0);

    // Collect required documents
    const docs = Array.from(document.querySelectorAll('.doc-field'))
      .map(field => field.value)
      .filter(val => val.length > 0);

    if (!name || !project || !description || !deadline || docs.length === 0 || contractorEmails.length === 0) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    showToast('Creating RFQ...', 'success');

    // Create RFQ record
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .insert([{
        rfq_name: name,
        project_name: project,
        description: description,
        deadline: deadline,
        budget: budget,
        required_documents: docs,
        created_by: currentUser.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (rfqError) throw rfqError;

    // Create invitations for each contractor
    const invitations = contractorEmails.map(email => ({
      rfq_id: rfq.id,
      contractor_email: email,
      invitation_token: generateUUID(),
      used: false,
      created_at: new Date().toISOString()
    }));

    const { error: invitationError } = await supabase
      .from('rfq_invitations')
      .insert(invitations);

    if (invitationError) throw invitationError;

    // Display generated links
    showGeneratedLinks(rfq.id, invitations);
    resetCreateForm();
  } catch (err) {
    console.error('Error creating RFQ:', err);
    showToast('Error creating RFQ: ' + err.message, 'error');
  }
}

function resetCreateForm() {
  document.getElementById('create-rfq-form').reset();
  document.getElementById('required-docs-builder').innerHTML = '';
  documentFields = [];
}

function showGeneratedLinks(rfqId, invitations) {
  const linksContainer = document.getElementById('generated-links-list');
  const baseUrl = window.location.origin + window.location.pathname;

  let linksHtml = '';
  invitations.forEach(inv => {
    const link = `${baseUrl}?rfq=${inv.invitation_token}`;
    linksHtml += `Email: ${inv.contractor_email}\n${link}\n\n`;
  });

  linksContainer.textContent = linksHtml;
  openModal('generated-links-modal');
  showToast('RFQ created successfully!', 'success');
}

function copyAllLinks() {
  const text = document.getElementById('generated-links-list').textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Links copied to clipboard', 'success');
  });
}

// ===== SUBMISSIONS MANAGEMENT =====
async function loadSubmissions() {
  try {
    const { data: submissions, error } = await supabase
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

    if (error) throw error;

    // Populate RFQ filter
    const rfqs = new Map();
    submissions.forEach(sub => {
      if (sub.rfqs) rfqs.set(sub.rfq_id, sub.rfqs.rfq_name);
    });

    const filterSelect = document.getElementById('rfq-filter');
    filterSelect.innerHTML = '<option value="">All RFQs</option>';
    rfqs.forEach((name, id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      filterSelect.appendChild(option);
    });

    displaySubmissions(submissions);
  } catch (err) {
    console.error('Error loading submissions:', err);
    showToast('Error loading submissions', 'error');
  }
}

function displaySubmissions(submissions) {
  const container = document.getElementById('submissions-list');
  const rfqFilter = document.getElementById('rfq-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  let filtered = submissions;
  if (rfqFilter) filtered = filtered.filter(s => s.rfq_id === rfqFilter);
  if (statusFilter) filtered = filtered.filter(s => s.status === statusFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--ink-2);">No submissions found</p>';
    return;
  }

  container.innerHTML = filtered.map(sub => `
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
}

async function openSubmissionDetail(submissionId) {
  try {
    const { data: submission, error } = await supabase
      .from('rfq_submissions')
      .select(`
        *,
        rfqs(rfq_name),
        rfq_submission_documents(*)
      `)
      .eq('id', submissionId)
      .single();

    if (error) throw error;

    currentSubmissionId = submissionId;

    // Display contractor details
    const detailsContent = document.getElementById('submission-details-content');
    detailsContent.innerHTML = `
      <h4>${submission.contractor_name}</h4>
      <p><strong>Email:</strong> ${submission.contractor_email}</p>
      <p><strong>Phone:</strong> ${submission.contractor_phone || 'N/A'}</p>
      <p><strong>Company Reg:</strong> ${submission.contractor_reg || 'N/A'}</p>
      <p><strong>RFQ:</strong> ${submission.rfqs?.rfq_name}</p>
      <p><strong>Submitted:</strong> ${new Date(submission.created_at).toLocaleString('en-ZA')}</p>
    `;

    // Display documents
    const docsList = document.getElementById('submission-documents-list');
    if (submission.rfq_submission_documents && submission.rfq_submission_documents.length > 0) {
      docsList.innerHTML = submission.rfq_submission_documents.map(doc => `
        <div style="padding:10px; background:var(--bg-2); border-radius:4px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>${doc.file_name}</span>
          <button class="btn secondary" style="padding:6px 12px; font-size:12px;" onclick="downloadDocument('${doc.file_path}', '${doc.file_name}')">Download</button>
        </div>
      `).join('');
    }

    document.getElementById('submission-status-update').value = submission.status;
    openModal('submission-detail-modal');
  } catch (err) {
    console.error('Error loading submission:', err);
    showToast('Error loading submission', 'error');
  }
}

async function updateSubmissionStatus() {
  try {
    const status = document.getElementById('submission-status-update').value;
    const { error } = await supabase
      .from('rfq_submissions')
      .update({ status })
      .eq('id', currentSubmissionId);

    if (error) throw error;

    showToast('Status updated successfully', 'success');
    closeModal('submission-detail-modal');
    loadSubmissions();
  } catch (err) {
    console.error('Error updating status:', err);
    showToast('Error updating status', 'error');
  }
}

async function downloadDocument(filePath, fileName) {
  try {
    const { data, error } = await sbClient.storage
      .from('rfq-documents')
      .download(filePath);

    if (error) throw error;

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error downloading document:', err);
    showToast('Error downloading document', 'error');
  }
}

function filterSubmissions() {
  const container = document.getElementById('submissions-list');
  const items = Array.from(container.querySelectorAll('.submission-card'));
  const rfqFilter = document.getElementById('rfq-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  items.forEach(item => {
    let show = true;
    // Filter logic would go here
    item.style.display = show ? 'flex' : 'none';
  });
}

// ===== UTILITY FUNCTIONS =====
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.style.display = 'flex';
  modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.style.display = 'none';
  modal.classList.remove('active');
}

function closeAll() {
  document.querySelectorAll('.modal').forEach(m => {
    m.style.display = 'none';
  });
}

function showToast(message, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showPopiModal() {
  openModal('popia-modal');
}

function acknowledgePopia() {
  popiAcknowledged = true;
  closeModal('popia-modal');
  document.getElementById('submission-form').dispatchEvent(new Event('submit'));
}
