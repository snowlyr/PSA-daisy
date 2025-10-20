# PSA Daisy

Daisy is a Power BI–aware chat assistant backed by Azure OpenAI. The repo contains a Next.js frontend (`frontend/`) and optional Node.js helpers in `backend/`.

## Prerequisites

- Node.js 18+ and npm
- Power BI service principal credentials (tenant ID, client ID, client secret, workspace ID, report ID)
- Azure OpenAI endpoint + key
- (Optional) `Reference sample data.pdf` to generate a local snapshot

## Quick Start

```bash
git clone <repo>
cd PSA-daisy
npm install --prefix frontend
```

1. Copy `.env` to `.env.local` inside `frontend/` (or update the existing one) and fill in:

   ```env
   AZURE_OPENAI_API_KEY=...
   AZURE_OPENAI_ENDPOINT=...
   AZURE_OPENAI_DEPLOYMENT=...
   AZURE_OPENAI_API_VERSION=2025-01-01-preview

   TENANT_ID=...
   CLIENT_ID=...
   CLIENT_SECRET=...
   WORKSPACE_ID=...
   REPORT_ID=...

   POWER_BI_DISABLE_DAX=true
   POWER_BI_SNAPSHOT_PATH=data/powerbi_snapshot.json

   NEXT_PUBLIC_CHAT_API=/api/chat
   ```

2. If your workspace is not XMLA-enabled, generate the snapshot so Daisy has data:

   ```bash
   python -m pip install pdfplumber
   python scripts/generate_snapshot_from_pdf.py
   ```

   (This script converts `Reference sample data.pdf` to `frontend/data/powerbi_snapshot.json`.)

3. Start the Next.js app:

   ```bash
   cd frontend
   npm run dev
   ```

4. Open `http://localhost:3000` and start chatting with Daisy.

## Switching to Live Power BI Data

If the Power BI admin enables XMLA read on the workspace (Premium/PPU + Build permissions):

1. Set `POWER_BI_DISABLE_DAX=false` in `.env.local`.
2. (Optional) configure `POWER_BI_PAGE_NAME`/`POWER_BI_VISUAL_NAME` to choose a specific table visual for CSV exports.
3. Restart the Next.js server. Daisy will now call Power BI’s `executeQueries` and `ExportTo` endpoints at request time.

## Backend Helpers (Optional)

```bash
cd backend
npm install
node powerBI.js      # sample Power BI queries
node aiWrapper.js    # sample Azure OpenAI call
```

The backend folder is a sandbox for experimenting with Power BI and Azure OpenAI APIs. The production chat endpoint lives in the frontend.
