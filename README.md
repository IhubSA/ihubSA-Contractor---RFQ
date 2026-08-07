# CNWE RFQ Site System

A complete Request for Quotation (RFQ) management system for CNWE Energy contractors on construction sites.

## Overview

This is a web-based RFQ platform where:
- **Admin users** create RFQs, specify required documents, and generate unique contractor links
- **Contractors** receive unique links, view RFQ details, and submit documents
- **Documents** are securely stored in Supabase Storage
- **Submissions** are tracked and reviewable in the admin dashboard

## Features

✅ Unique contractor links (one per contractor, one-time use)  
✅ Custom required document specification  
✅ PDF, Word, and Excel file upload support  
✅ Submission tracking and status management  
✅ Document download capability  
✅ POPIA compliance notices  
✅ Responsive design matching CNWE branding  

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Supabase (PostgreSQL + Storage)
- **Deployment:** GitHub Pages or custom hosting

## Project Structure

```
cnwe-rfq-site-system/
├── index.html           # Main application (contractor + admin)
├── styles.css           # Design system and styling
├── app.js               # Application logic and Supabase integration
├── README.md            # This file
├── .gitignore           # Git ignore rules
└── docs/
    ├── SUPABASE_SETUP_COMPLETE.md
    ├── QUICK_REFERENCE.txt
    └── DEPLOYMENT.md
```

## Setup Instructions

### 1. Prerequisites

- Git installed on your machine
- GitHub account
- Supabase account (already set up — see QUICK_REFERENCE.txt)

### 2. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/cnwe-rfq-site-system.git
cd cnwe-rfq-site-system
```

### 3. Create Supabase Storage Bucket

The database is already set up. You just need to create the storage bucket:

1. Go to https://zilumoopwnrtrtnsmjhr.supabase.co
2. Click **Storage** (left sidebar)
3. Click **Create new bucket**
4. Name: `rfq-documents`
5. Set to **Private**
6. Click **Create**

### 4. Deploy to GitHub Pages

#### Option A: GitHub Pages (Free)

1. Push code to GitHub
2. Go to repository **Settings > Pages**
3. Set **Source** to "Deploy from a branch"
4. Select **Branch: main, Folder: / (root)**
5. Click **Save**

Your site will be live at: `https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/`

#### Option B: Custom Domain

1. Add domain to GitHub Pages settings
2. Update your domain's DNS to point to GitHub Pages
3. Site will be live at your custom domain

#### Option C: Other Hosting (Netlify, Vercel, etc.)

Simply connect your GitHub repo and deploy. All files are static (no build required).

### 5. Access the Application

- **Contractor Portal:** `https://your-domain/index.html?rfq=TOKEN`
- **Admin Panel:** `https://your-domain/index.html` → Click "Staff login"

## Usage

### For Contractors

1. Receive email with unique RFQ link from CNWE
2. Click the link to open the RFQ portal
3. View RFQ details and required documents
4. Enter your company information
5. Upload all required documents
6. Submit for review

### For Admin Users

1. Navigate to the application
2. Click **"Staff login"** button
3. Enter password: `CNWE2026` *(Change this immediately!)*

#### Create an RFQ

1. Go to **Create RFQ** tab
2. Fill in:
   - RFQ Name/Title
   - Project Name
   - Description
   - Submission Deadline
   - Budget (optional)
3. Add required document types (e.g., "Insurance Certificate", "Safety Plan")
4. Enter contractor email addresses (one per line)
5. Click **Create RFQ & Generate Links**
6. Copy links and send via email

#### Review Submissions

1. Go to **Review Submissions** tab
2. Filter by RFQ or submission status
3. Click any submission to view details
4. Download uploaded documents
5. Update status (submitted → reviewed)

## Configuration

### Change Admin Password

⚠️ **Important:** Change the default password immediately!

1. Open `app.js`
2. Find the `promptAdminLogin()` function
3. Change this line:
   ```javascript
   if (password === 'CNWE2026') {  // Change 'CNWE2026' to your password
   ```
4. Save and redeploy

### Supabase Credentials

The app.js file includes your Supabase credentials. These are safe to commit to GitHub because:
- The Anon Key only allows access through Row Level Security policies
- No sensitive data can be accessed without proper authentication
- This is standard practice for web apps using Supabase

If you want extra security, see `docs/DEPLOYMENT.md` for using environment variables.

## Database Schema

### rfqs
- `id` (UUID, primary key)
- `rfq_name` (text)
- `project_name` (text)
- `description` (text)
- `deadline` (timestamp)
- `budget` (text, optional)
- `required_documents` (text array)
- `created_by` (text)
- `created_at`, `updated_at` (timestamps)

### rfq_invitations
- `id` (UUID, primary key)
- `rfq_id` (UUID, foreign key)
- `contractor_email` (text)
- `invitation_token` (text, unique)
- `used` (boolean)
- `created_at` (timestamp)

### rfq_submissions
- `id` (UUID, primary key)
- `rfq_id` (UUID, foreign key)
- `contractor_name`, `contractor_email`, `contractor_phone`, `contractor_reg` (text)
- `status` (text: 'submitted' or 'reviewed')
- `created_at`, `updated_at` (timestamps)

### rfq_submission_documents
- `id` (UUID, primary key)
- `submission_id` (UUID, foreign key)
- `file_name`, `file_path` (text)
- `file_size` (integer)
- `uploaded_at` (timestamp)

## Troubleshooting

### "No RFQ Found" Message
- Verify the URL contains the correct `?rfq=TOKEN`
- Check that the token hasn't been used already
- Tokens are single-use for security

### Files Not Uploading
- Verify `rfq-documents` storage bucket exists in Supabase
- Check bucket is set to Private
- Ensure file format is PDF, Word, or Excel
- Check browser console (F12) for error messages

### Admin Login Not Working
- Verify password is correct (case-sensitive)
- Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cookies if needed
- Check browser console for errors

### Styling Issues
- Hard refresh browser (Ctrl+Shift+R)
- Verify `styles.css` is in the same folder as `index.html`
- Check that all files are properly deployed

## Documentation

- **SUPABASE_SETUP_COMPLETE.md** — Full Supabase setup details
- **QUICK_REFERENCE.txt** — Quick reference card with credentials and test links
- **DEPLOYMENT.md** — Detailed deployment instructions for different platforms

## Support & Development

This is a vanilla JavaScript application with no build process required. All files are static and can be deployed to any web server.

For questions or issues:
1. Check the troubleshooting section above
2. Review the documentation files
3. Check browser console (F12) for error messages
4. Verify Supabase connectivity in your browser's Network tab

## License

© 2026 CNWE Energy (Pty) Ltd

## Version

Version 1.0.0 — August 7, 2026
