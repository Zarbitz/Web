# ZARBITZ website

Responsive static website and interactive product design demo. Serve dist/ with any static HTTP server. No install or build step required.

## Included
Homepage; six solution pages; technology explainers; About; Contact with local enquiry-draft download; individual and enterprise sign-in/sign-up entry designs; illustrative customer workspace, reports, datasets, and admin permission controls; preview privacy notice.

## Deliberately awaiting setup
Google OAuth, email/phone authentication, MFA, enterprise SSO, actual account registration, enquiry delivery, private customer storage, server-side authorization, audit logs, notifications, and geospatial processing. No passwords are collected. Demo permissions are in memory, reset on reload, and must never protect real data.

## Production implementation
Choose an identity provider, configure approved redirect URLs, deploy a server-side permission layer that checks organization/project/resource/action on every request, use private object storage, implement review/publication records, connect the enquiry inbox, and publish finalized privacy/terms and service details. Replace fictional example resources with approved materials only after authorization tests pass.

## Content and assets
Photography is representative, not evidence of ZARBITZ customer work. Images sourced from Unsplash. Files: terrain (photo-1446776811953-b23d57bd21aa), agriculture (photo-1500382017468-9049fed747ef), buildings (photo-1486406146926-c627a92ad1ab), mining (photo-1628487749130-2d41acb1802a), dams (photo-1503754163129-a02a0c097de0), bridges (photo-1567896084386-0b517f78ac80), roads (photo-1680664777916-0e4735183619). DM Sans and Space Grotesk are loaded from Google Fonts.

## Verification
JavaScript syntax checked. Browser-reviewed desktop and 390px mobile homepage, account entry, workspace navigation, and report-access revocation. Hosting remains owner-private. This is a design preview, not a production authentication system.

---

# Dam Stability Observatory (InSAR & Zarr Web Dashboard)

Interactive satellite InSAR dam deformation monitoring dashboard covering **390 major Indian dams** (CWC registered) and Sentinel-1 SBAS displacement time-series.

### Quick Start (Run Locally)
1. Double-click `start.command` (macOS / Linux) or `start.bat` (Windows).
2. Or run via terminal:
   ```bash
   python3 dashboard/server.py
   ```
3. Open `http://localhost:8767` in any browser.

### Structure
- `dashboard/`: Standalone web dashboard application and local server (`server.py`).
- `dist/dams/`: Production static build deployed alongside the website.
- `source/`: React & ESBuild frontend source code (`src/main.jsx`, `src/DamMap.jsx`, `build.mjs`).
- `scripts/`: Python pipelines for building Master Zarr v3 stores and calculating displacement matrices (`build_master_zarr.py`).
- `start.command` / `start.bat`: One-click local launch scripts.

