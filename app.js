// CNWE RFQ System - Application Logic

const SUPABASE_URL = 'https://zilumoopwnrtrtnsmjhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbHVtb29wd25ydHJ0bnNtamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTU2MzgsImV4cCI6MjEwMTY3MTYzOH0.t8aQkOU29pwG9fwW9BlTwd4oie2jxkZa43mb3yc55kg';

let client = null;
let currentUser = null;
let currentRFQId = null;
let isSubmittingRFQ = false;
window.lastInvitations = [];

// ===== INITIALIZATION =====
function initApp() {
  console.log('Initializing RFQ System...');
  
  // Initialize Supabase
  client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase connected');
  
  // Check for admin login
  const adminLoggedIn = localStorage.getItem('cnwe_admin_logged_in');
  
  // Check URL for contractor token
  const params = new URLSearchParams(window.location.search);
  const rfqToken = params.get('rfq');
  
  if (rfqToken) {
    // Load contractor view
    console.log('Loading RFQ with token:', rfqToken);
    loadContractorView(rfqToken);
  } else if (adminLoggedIn) {
    // Load admin view
    showAdminView();
  } else {
    // Show public view with login option
    checkAdminLogin();
  }

  console.log('DOM loaded - starting app initialization');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded triggered');
  });
}

// ===== CONTRACTOR VIEW =====
async function loadContractorView(token) {
  try {
    console.log('Loading contractor view for token:', token);
    
    // Hide admin view
    document.getElementById('public-view').style.display = 'block';
    document.getElementById('admin-view').style.display = 'none';
    
    // Find invitation
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

    // Load RFQ details
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

    // Attach form handler
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

    for (let input of fileInputs) {
      if (input.files[0]) {
        try {
          const file = input.files[0];
          const filePath = `rfq-${currentRFQId}/sub-${submission.id}/${Date.now()}-${file.name}`;
          
          const { error: uploadError } = await client.storage
            .from('rfq-documents')
            .upload(filePath, file);

          if (uploadError) {
            console.warn('⚠️ File upload failed:', uploadError.message);
            continue;
          }

          await client.from('rfq_submission_documents').insert([{
            submission_id: submission.id,
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

// ===== ADMIN VIEW =====
function checkAdminLogin() {
  document.getElementById('public-view').style.display = 'block';
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('rfq-portal').style.display = 'none';
  document.getElementById('no-rfq-message').style.display = 'block';
  document.getElementById('no-rfq-message').innerHTML = `
    <div class="card" style="text-align: center;">
      <h2 style="margin-top:0;">RFQ Management System</h2>
      <p style="margin-bottom: 20px;">Click below to access the admin panel</p>
      <button onclick="promptAdminLogin()" class="btn gold" style="padding: 12px 24px;">Staff Login</button>
    </div>
  `;
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
  
  document.getElementById('create-tab').style.display = 'block';
  document.getElementById('console-tab').style.display = 'none';
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

  isSubmittingRFQ = true;

  try {
    console.log('=== CREATE RFQ STARTED ===');
    
    // Get fields by name attribute
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

    // Get required documents
    const docInputs = document.querySelectorAll('.doc-field');
    const requiredDocs = Array.from(docInputs)
      .map(input => input.value ? input.value.trim() : '')
      .filter(val => val.length > 0);

    // Validate
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

    // Create RFQ
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

    if (rfqError || !rfq || !rfq.id) {
      throw new Error('Failed to create RFQ');
    }

    console.log('✅ RFQ created:', rfq.id);

    // Create invitations
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
    showGeneratedLinks(rfq.id, invitations);
    resetCreateForm();

  } catch (err) {
    console.error('❌ Error creating RFQ:', err);
    showToast('Error: ' + err.message, 'error');
  } finally {
    isSubmittingRFQ = false;
  }
}

// ===== RFQ CONSOLE =====
async function loadRFQConsole() {
  try {
    console.log('Loading RFQ Console...');
    
    const { data: rfqs, error: rfqError } = await client
      .from('rfqs')
      .select('*')
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
    console.log('Loading submissions...');
    
    const { data: submissions, error } = await client
      .from('rfq_submissions')
      .select(`*, rfqs(rfq_name)`)
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
    
    showToast('✅ Contractor added!', 'success');
    navigator.clipboard.writeText(link);
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
    const { data } = client.storage.from('rfq-documents').getPublicUrl(path);
    if (data && data.publicUrl) {
      const link = document.createElement('a');
      link.href = data.publicUrl;
      link.download = name;
      link.click();
      showToast('✅ Download started', 'success');
    }
  } catch (err) {
    showToast('Document: ' + name, 'info');
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, initializing...');
  setupCreateRFQForm();
});
