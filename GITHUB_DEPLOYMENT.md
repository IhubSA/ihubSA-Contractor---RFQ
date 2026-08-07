# GitHub Deployment Guide — CNWE RFQ Site System

Complete step-by-step guide for deploying the RFQ system to GitHub and GitHub Pages.

## Quick Start (5 minutes)

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. **Repository name:** `cnwe-rfq-site-system`
3. **Description:** CNWE Energy RFQ Management System
4. **Visibility:** Public (needed for GitHub Pages)
5. **Initialize with:** No (we'll push existing files)
6. Click **Create repository**

### Step 2: Clone or Initialize Locally

#### If you have Git installed:

```bash
# Create a new folder
mkdir cnwe-rfq-site-system
cd cnwe-rfq-site-system

# Initialize git
git init

# Add GitHub as remote
git remote add origin https://github.com/YOUR_USERNAME/cnwe-rfq-site-system.git
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3: Add Files

Copy these files to your local folder:
```
index.html
styles.css
app.js
README.md
.gitignore
```

### Step 4: Commit and Push

```bash
# Add all files
git add .

# Commit
git commit -m "Initial commit: RFQ system setup"

# Push to GitHub (may prompt for authentication)
git branch -M main
git push -u origin main
```

### Step 5: Enable GitHub Pages

1. Go to your repository: `https://github.com/YOUR_USERNAME/cnwe-rfq-site-system`
2. Click **Settings** (top menu)
3. Scroll to **"Pages"** section (left sidebar)
4. **Source:** Select "Deploy from a branch"
5. **Branch:** Select `main` and `/` (root folder)
6. Click **Save**

✅ Your site is now live at: `https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/`

---

## Detailed Setup Instructions

### Option A: Using GitHub Desktop (Easiest)

**1. Download GitHub Desktop**
- Go to https://desktop.github.com/
- Download and install

**2. Create Repository**
- Open GitHub Desktop
- File → New Repository
- Name: `cnwe-rfq-site-system`
- Local path: Choose where to store it
- Click **Create Repository**

**3. Add Files**
- Copy `index.html`, `styles.css`, `app.js`, `README.md`, `.gitignore` to the folder
- They should appear in GitHub Desktop as "Changes"

**4. Commit**
- Write commit message: "Initial commit: RFQ system setup"
- Click **Commit to main**

**5. Publish to GitHub**
- Click **Publish repository**
- Keep it **Public** (required for GitHub Pages)
- Click **Publish Repository**

**6. Enable GitHub Pages**
- Go to `https://github.com/YOUR_USERNAME/cnwe-rfq-site-system`
- Settings → Pages
- Source: "Deploy from a branch"
- Branch: `main`, Folder: `/`
- Save

✅ Done! Your site is live.

---

### Option B: Using Command Line (Git)

**1. Install Git**
- Windows: https://git-scm.com/download/win
- Mac: https://git-scm.com/download/mac
- Linux: `sudo apt-get install git`

**2. Configure Git** (first time only)
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

**3. Create Local Repository**
```bash
mkdir cnwe-rfq-site-system
cd cnwe-rfq-site-system
git init
```

**4. Add Remote**
```bash
git remote add origin https://github.com/YOUR_USERNAME/cnwe-rfq-site-system.git
```

**5. Copy Files**
- Copy all files to this folder:
  - index.html
  - styles.css
  - app.js
  - README.md
  - .gitignore

**6. Commit and Push**
```bash
git add .
git commit -m "Initial commit: RFQ system setup"
git branch -M main
git push -u origin main
```

**7. Create Initial commit if needed**
```bash
# If GitHub says the repository is empty:
git pull origin main --allow-unrelated-histories
git push -u origin main
```

**8. Enable GitHub Pages**
- Go to https://github.com/YOUR_USERNAME/cnwe-rfq-site-system
- Settings → Pages
- Source: "Deploy from a branch"
- Branch: `main`, Folder: `/`
- Save

✅ Site is live!

---

### Option C: Using GitHub Web Interface (Simplest)

**1. Go to Repository**
- https://github.com/YOUR_USERNAME/cnwe-rfq-site-system

**2. Add Files Via Web**
- Click **Add file** → **Create new file**
- Create each file:
  - Click in filename box, type `index.html`
  - Paste content
  - Scroll down, click **Commit changes**
  - Repeat for `styles.css`, `app.js`, `README.md`, `.gitignore`

**3. Enable GitHub Pages**
- Settings → Pages
- Source: "Deploy from a branch"
- Branch: `main`, Folder: `/`
- Save

✅ Live at: `https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/`

---

## After Deployment

### 1. Create Supabase Storage Bucket

✅ This must be done manually in Supabase (not on GitHub):

1. Go to https://zilumoopwnrtrtnsmjhr.supabase.co
2. Click **Storage**
3. Click **Create new bucket**
4. Name: `rfq-documents`
5. Set to **Private**
6. Click **Create bucket**

### 2. Test Your Site

Use these test links:
```
https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/index.html?rfq=test-token-001
https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/index.html?rfq=test-token-002
https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/index.html?rfq=test-token-003
```

**Test as Contractor:**
1. Click a link
2. See RFQ details
3. Upload test files
4. Submit

**Test as Admin:**
1. Go to `https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/index.html`
2. Click "Staff login"
3. Enter password: `CNWE2026`
4. Create test RFQ
5. View submissions

### 3. Change Admin Password

⚠️ **Important:** Change from `CNWE2026` immediately!

1. Go to your repository on GitHub
2. Click on `app.js`
3. Click the edit button (pencil icon)
4. Find this line (around line 175):
   ```javascript
   if (password === 'CNWE2026') {
   ```
5. Change `'CNWE2026'` to your new password
6. Scroll down, click **Commit changes**
7. Write commit message: "chore: update admin password"
8. Click **Commit**

✅ Changes deploy automatically!

---

## Using Your Custom Domain

If you have a custom domain (e.g., `mysite.com`):

### 1. Update DNS

In your domain registrar, add a CNAME record:
- **Name:** `rfq`
- **Value:** `YOUR_USERNAME.github.io`

Or point to GitHub's IP addresses:
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

### 2. Update GitHub Pages

1. Go to your repository Settings → Pages
2. Under "Custom domain", enter: `mysite.com/rfq` or `rfq.mysite.com`
3. Wait 5-10 minutes for DNS to update

### 3. Enable HTTPS

1. In GitHub Pages settings, check **Enforce HTTPS** (usually auto-enabled)

✅ Site now live at your custom domain!

---

## Making Changes

Every time you update files:

### Using GitHub Desktop:
1. Make changes to files locally
2. See changes in GitHub Desktop
3. Write commit message (e.g., "Update RFQ deadline text")
4. Click **Commit to main**
5. Click **Push origin**

### Using Command Line:
```bash
git add .
git commit -m "Your message here"
git push origin main
```

### Using GitHub Web:
1. Click on the file in your repo
2. Click the edit button (pencil icon)
3. Make changes
4. Click **Commit changes**

✅ Changes deploy automatically within 30 seconds!

---

## Troubleshooting

### Site Not Loading
- Wait 2-3 minutes after enabling GitHub Pages (first deploy takes time)
- Check URL: Should be `https://YOUR_USERNAME.github.io/cnwe-rfq-site-system/`
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Styling/JS Not Loading
- Hard refresh browser (Ctrl+Shift+R)
- Check file names are exact: `index.html`, `styles.css`, `app.js`
- Verify files are in repository root (not in a folder)

### GitHub Pages Not Activating
- Ensure repository is **PUBLIC** (not private)
- Settings → Pages → Source should be "Deploy from a branch"
- Branch should be `main`, Folder should be `/`

### Can't Push Changes
- Make sure you have write access to the repository
- If prompted, sign in with your GitHub account
- On command line: `git pull origin main` first, then push

### 404 Error on Custom Domain
- Wait 5-10 minutes for DNS to update
- Check domain settings in GitHub Pages
- Verify DNS records are correct

---

## File Structure on GitHub

After deployment, your repository should look like:

```
cnwe-rfq-site-system/
├── index.html
├── styles.css
├── app.js
├── README.md
├── .gitignore
└── [GitHub files]
    ├── .git/
    └── .github/
```

**All working files in the root folder** — GitHub Pages serves them directly.

---

## GitHub Pages Limits

✅ **What you can do:**
- Unlimited sites per account
- Unlimited storage
- Unlimited bandwidth
- Custom domain support
- HTTPS/SSL included
- Auto-deploy on push

❌ **What you can't do:**
- Server-side code (PHP, Node.js, etc.)
- Databases (but Supabase handles this!)
- Real-time data sync with edge functions
- Private files

✅ **Our setup:** All static files + Supabase backend = Perfect for GitHub Pages!

---

## Security Notes

### Supabase Credentials in app.js

It's safe to commit the Anon Key because:
1. It only allows read/write through Row Level Security policies
2. These policies restrict who can access what
3. No secret keys are exposed
4. This is standard practice for web apps

### Protect Sensitive Data

Never commit:
- Service Role Key (for admin operations only)
- Database password
- Real admin passwords (keep those mental)
- Secrets from environment variables

---

## Next Steps

1. ✅ Create GitHub repository
2. ✅ Push files to GitHub
3. ✅ Enable GitHub Pages
4. ✅ Create Supabase storage bucket
5. ✅ Test with demo links
6. ✅ Change admin password
7. ✅ Send RFQ links to contractors!

---

## Support

- **GitHub Pages Docs:** https://pages.github.com
- **GitHub Help:** https://docs.github.com
- **Troubleshooting:** See section above

Good luck! 🚀
