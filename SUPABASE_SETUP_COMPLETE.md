# ✅ RFQ Hub — Complete Setup Guide

**Status:** Your Supabase project is fully configured and ready to use!

---

## 📋 Your Supabase Project Details

| Item | Value |
|------|-------|
| **Project Name** | CNWE RFQ System |
| **Project URL** | https://zilumoopwnrtrtnsmjhr.supabase.co |
| **Project ID** | zilumoopwnrtrtnsmjhr |
| **Region** | eu-west-1 (Ireland) |
| **Status** | ✅ Active |

---

## 🔑 API Credentials (Already in app.js)

Your `app.js` has been updated with these credentials:

```javascript
const SUPABASE_URL = 'https://zilumoopwnrtrtnsmjhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## 🗄️ Database Tables Created

✅ `rfqs` — RFQ records (name, description, deadline, budget, required documents)
✅ `rfq_invitations` — Unique contractor links (one per contractor per RFQ)
✅ `rfq_submissions` — Contractor submissions (contact info + status)
✅ `rfq_submission_documents` — Uploaded files (file name, path, size)

**Security:** Row Level Security (RLS) is **ENABLED** with appropriate policies.

---

## 📦 Storage Bucket Setup

Still need to create manually in Supabase dashboard:

1. Go to: https://zilumoopwnrtrtnsmjhr.supabase.co
2. Click **Storage** (left sidebar)
3. Click **Create new bucket**
4. Name: `rfq-documents`
5. Set to **Private**
6. Click **Create**

This is where contractor-uploaded documents will be stored.

---

## 🧪 Test Data

A test RFQ has been created in your database:

**Test RFQ Details:**
- **Name:** Test RFQ - Safety Equipment
- **Project:** Table Bay Construction Site
- **Deadline:** 14 days from now
- **Budget:** R50,000 - R100,000
- **Required Documents:** 
  - Insurance Certificate
  - Safety Compliance Report
  - Company Profile
  - Price Quote

**Test Contractor Links:**

Copy and use these links to test the system:

```
Test Link 1 (contractor1@example.com):
YOUR_DOMAIN/rfq/index.html?rfq=test-token-001

Test Link 2 (contractor2@example.com):
YOUR_DOMAIN/rfq/index.html?rfq=test-token-002

Test Link 3 (contractor3@example.com):
YOUR_DOMAIN/rfq/index.html?rfq=test-token-003
```

Replace `YOUR_DOMAIN` with your actual domain (e.g., `https://mysite.com`)

---

## 🚀 File Setup

You have three files ready to deploy:

1. **rfq-index.html** — Main application (rename to `index.html`)
2. **rfq-styles.css** — Styling (keep as `styles.css`)
3. **rfq-app.js** — Logic with credentials (keep as `app.js`)

**Upload location:**
```
/your-domain/rfq/
  ├── index.html
  ├── styles.css
  └── app.js
```

**Access URLs:**
- Contractor Portal: `https://your-domain/rfq/index.html?rfq=TOKEN`
- Admin Panel: `https://your-domain/rfq/index.html` → Click "Staff login"

---

## 🔐 Admin Login

**Password:** `CNWE2026`

⚠️ **Change this immediately!** Edit `app.js` line in `promptAdminLogin()` function:
```javascript
if (password === 'CNWE2026') {  // Change to something secure
```

---

## ✨ Testing the System

### 1. Test Contractor Portal

1. Use one of the test links above
2. Fill in contractor details
3. Try uploading test files (PDF, Word, Excel)
4. Submit and verify success message

### 2. Test Admin Dashboard

1. Go to your RFQ site
2. Click "Staff login" button
3. Enter password: `CNWE2026`
4. You'll see:
   - **Create RFQ** tab — Make new RFQs
   - **Review Submissions** tab — See contractor responses

### 3. Create Your First Real RFQ

1. Login as admin
2. Fill in RFQ details
3. Add required document types
4. Enter contractor email addresses
5. System generates unique links
6. Copy and send to contractors via email

---

## 📊 Database Queries

Check your data in Supabase:

**View all RFQs:**
```sql
SELECT * FROM rfqs;
```

**View all contractor links:**
```sql
SELECT * FROM rfq_invitations;
```

**View all submissions:**
```sql
SELECT * FROM rfq_submissions;
```

**View uploaded documents:**
```sql
SELECT * FROM rfq_submission_documents;
```

---

## ⚙️ Configuration Checklist

- [x] Supabase project created
- [x] Database tables created
- [x] Row Level Security enabled
- [x] API credentials added to app.js
- [ ] Create `rfq-documents` storage bucket (do this manually in dashboard)
- [ ] Upload files to your web server
- [ ] Test with contractor links
- [ ] Change admin password from `CNWE2026`
- [ ] Create your first RFQ

---

## 🔗 Useful Links

- **Supabase Dashboard:** https://supabase.com/dashboard/org/vxwnsqrhjzupghvjwkqd/projects
- **Your Project:** https://zilumoopwnrtrtnsmjhr.supabase.co
- **Documentation:** https://supabase.com/docs

---

## 🆘 Troubleshooting

### Files Not Uploading?
- Verify `rfq-documents` bucket exists in Storage
- Check bucket is set to Private
- Verify file format (PDF, Word, Excel only)

### "No RFQ Found" Error?
- Check the URL has correct `?rfq=TOKEN`
- Verify token hasn't been used already
- Check browser console for errors

### Admin Login Not Working?
- Verify password is correct
- Check browser cache (Ctrl+Shift+R)
- Open browser console (F12) to see errors

### Styling Looks Wrong?
- Ensure `styles.css` is in same folder as `index.html`
- Hard refresh browser (Ctrl+Shift+R)
- Check file names match exactly

---

## 📝 Next Steps

1. **Create storage bucket** (5 minutes) — Go to Supabase dashboard > Storage > Create "rfq-documents"
2. **Upload files to server** (5 minutes) — Upload index.html, styles.css, app.js
3. **Test with demo link** (5 minutes) — Use test links above
4. **Change admin password** (1 minute) — Edit app.js
5. **Create your first RFQ** (10 minutes) — Login as admin and create one

---

## 📞 Support

All files have inline comments explaining the code. The system is designed to be self-explanatory and easy to modify.

Good luck! 🚀
