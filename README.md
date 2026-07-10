# Yachthub Charter Paperwork System

Digital charter agreement system for Yachthub Group. The form lets agents capture charter details, autosaves to Supabase, and generates a fully populated Charter Agreement docx in the browser.

## Files

- `index.html`: the charter form (5 tabs, autosave, generate)
- `docx-fill.js`: browser-side fill logic that populates the template from form data
- `pizzip.min.js`: zip library used to open and re-pack the docx
- `template.docx`: Charter Agreement Blue template
- `setup.sql`: Supabase schema (run once in the SQL editor of your Supabase project)
- `netlify.toml`: Netlify configuration
- `sample_payload.json`: reference payload showing the JSON structure the fill script expects

## Deployment

### 1. Push to GitHub

Create a new private repo and upload all the files in this folder to it. All the files sit at the root — no build step, no folders to configure.

### 2. Connect to Netlify

1. Go to https://app.netlify.com/start
2. Choose GitHub, pick the repo you just created.
3. Build command: leave blank. Publish directory: `.` (a single dot).
4. Click Deploy.

Netlify will publish the site at a URL like `your-site-name.netlify.app`. That's your live system.

### 3. Custom subdomain (optional)

If you want `charter.yachthubgroup.com`:

1. In Netlify: Site settings → Domain management → Add custom domain → enter `charter.yachthubgroup.com`.
2. Netlify shows you a DNS record (either a CNAME or an ALIAS) to add.
3. Add that record in whichever service manages `yachthubgroup.com`'s DNS.
4. Netlify auto-provisions HTTPS once the DNS resolves (usually a few minutes).

### 4. Supabase setup (already done for this project)

- Project URL and anon key are already embedded in `index.html`.
- Schema is already applied via `setup.sql`.
- To let yourself sign up smoothly from your phone: Supabase Dashboard → Authentication → Providers → Email → toggle **Confirm email** off. Save.
- Once your team's accounts are created, lock down open sign-up: same screen → toggle **Enable sign ups** off.

## How the system works

**Agent fills the form** across 5 tabs. Every field change autosaves to Supabase after an 800ms pause.

**Agent clicks Generate.** The browser:
1. Reads all `data-payload` attributes to build a JSON payload.
2. Loads `template.docx`.
3. Runs the fill logic in `docx-fill.js` to populate the template with the payload data.
4. Downloads the filled `Charter_Agreement_<charterer>_<date>.docx`.

No server involved for generation. Works on any modern browser including mobile Safari and Chrome.

## What's not yet included

- **PDF conversion.** Agents get the docx. If a PDF is needed, open the docx in Word or Google Docs and export. A future phase can add server-side PDF conversion via an external service.
- **Docusign integration.** Manual upload for now.
- **Charter Memorandum generation.** Currently a static template. Future phase: generate memo HTML client-side from the same payload.
- **Vessel dropdown auto-fill.** Currently only JEE JAM plus OTHER. Add more vessels by editing the `fleet` object near the top of the `<script>` block in `index.html`.
