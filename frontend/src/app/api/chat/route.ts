// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiVersion =
  process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview";
const apiKey = process.env.AZURE_OPENAI_API_KEY;

const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const workspaceId = process.env.WORKSPACE_ID;
const reportId = process.env.REPORT_ID;
const pageNameOverride = process.env.POWER_BI_PAGE_NAME;
const visualNameOverride = process.env.POWER_BI_VISUAL_NAME;
const snapshotPath = process.env.POWER_BI_SNAPSHOT_PATH;
const disableDaxSampling =
  ((process.env.POWER_BI_DISABLE_DAX || "").trim().toLowerCase() === "true" ||
    (process.env.POWER_BI_DISABLE_DAX || "").trim().toLowerCase() === "1");
const powerBiConfigured =
  tenantId && clientId && clientSecret && workspaceId && reportId;

const daxSamplingEnabled = !disableDaxSampling;

async function getPowerBiToken(): Promise<string | null> {
  if (!powerBiConfigured) return null;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId!);
  params.append("client_secret", clientSecret!);
  params.append("scope", "https://analysis.windows.net/powerbi/api/.default");

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Power BI token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`
    );
  }

  const tokenBody = await tokenResponse.json();
  return tokenBody.access_token as string;
}

async function getReportMetadata(
  accessToken: string
): Promise<{ datasetId: string; name: string } | null> {
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch report metadata: ${res.status} ${res.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }

  const data = await res.json();
  if (!data?.datasetId) return null;
  return { datasetId: data.datasetId, name: data.name || "Report" };
}

type PowerBiTable = {
  name: string;
  columns?: { name: string }[];
};

type PowerBiPage = {
  name: string;
  displayName?: string;
};

type PowerBiVisual = {
  name: string;
  displayName?: string;
  type?: string;
};

const manualPowerBiTables: PowerBiTable[] = [
  {
    name: "Reference sample data",
    columns: [
      { name: "Operator" },
      { name: "Service" },
      { name: "Dir" },
      { name: "BU" },
      { name: "Vessel" },
      { name: "IMO" },
      { name: "Rotation No." },
      { name: "From" },
      { name: "To" },
      { name: "Berth" },
      { name: "Status" },
      { name: "BTR as at 96h to ATB" },
      { name: "Final BTR (Local Time)" },
      { name: "ABT (Local Time)" },
      { name: "ATB (Local Time)" },
      { name: "ATU (Local Time)" },
      { name: "Arrival Variance (within 4h target)" },
      { name: "Arrival Accuracy (Final BTR)" },
      { name: "Wait Time (Hours): ATB-BTR" },
      { name: "Wait Time (Hours): ABT-BTR" },
      { name: "Wait Time (hours): ATB-ABT" },
      { name: "Berth Time (hours): ATU - ATB" },
      { name: "Assured Port Time Achieved (%)" },
      { name: "Bunker Saved (USD)" },
      { name: "Carbon Abatement (Tonnes)" }
    ]
  }
];

type ExecuteQueryRow = Record<string, unknown>;

function normalizeExecuteQueryRows(response: any): ExecuteQueryRow[] {
  if (!response?.results) return [];

  const rows: ExecuteQueryRow[] = [];
  for (const result of response.results) {
    const tables = Array.isArray(result?.tables) ? result.tables : [];
    for (const table of tables) {
      const columnNames = Array.isArray(table?.columns)
        ? table.columns.map((col: any, idx: number) => col?.name || `col${idx}`)
        : [];
      const tableRows = Array.isArray(table?.rows) ? table.rows : [];

      for (const row of tableRows) {
        if (Array.isArray(row)) {
          const mapped: ExecuteQueryRow = {};
          columnNames.forEach((name, idx) => {
            mapped[name] = row[idx];
          });
          rows.push(mapped);
        } else if (row && typeof row === "object") {
          rows.push(row as ExecuteQueryRow);
        } else {
          rows.push({ value: row });
        }
      }
    }
  }

  return rows;
}

async function runDatasetQuery(
  accessToken: string,
  datasetId: string,
  dax: string,
  label?: string
): Promise<ExecuteQueryRow[]> {
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/executeQueries`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      queries: [{ query: dax }],
      serializerSettings: { includeNulls: true }
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Power BI executeQueries failed${
        label ? ` for ${label}` : ""
      }: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`
    );
  }

  const data = await res.json();
  return normalizeExecuteQueryRows(data);
}

async function getDatasetTablesFromMetadata(
  accessToken: string,
  datasetId: string
): Promise<PowerBiTable[]> {
  try {
    const tableRows = await runDatasetQuery(
      accessToken,
      datasetId,
      `EVALUATE
SELECTCOLUMNS(
  FILTER('TMSCHEMA_TABLES', 'TMSCHEMA_TABLES'[IsHidden] = FALSE()),
  "tableName", 'TMSCHEMA_TABLES'[Name]
)`,
      "table metadata"
    );

    if (!tableRows.length) return [];

    const tableMap = new Map<string, PowerBiTable>();
    for (const row of tableRows) {
      const rawName =
        (row?.tableName as string) ||
        (row?.TableName as string) ||
        (row?.Name as string) ||
        "";
      const name = rawName.trim();
      if (!name) continue;
      if (!tableMap.has(name)) {
        tableMap.set(name, { name, columns: [] });
      }
    }

    const columnRows = await runDatasetQuery(
      accessToken,
      datasetId,
      `EVALUATE
SELECTCOLUMNS(
  FILTER('TMSCHEMA_COLUMNS', 'TMSCHEMA_COLUMNS'[IsHidden] = FALSE()),
  "tableName", 'TMSCHEMA_COLUMNS'[TableName],
  "columnName", 'TMSCHEMA_COLUMNS'[Name]
)`,
      "column metadata"
    );

    for (const row of columnRows) {
      const rawTable =
        (row?.tableName as string) ||
        (row?.TableName as string) ||
        (row?.Table as string) ||
        "";
      const rawColumn =
        (row?.columnName as string) ||
        (row?.ColumnName as string) ||
        (row?.Name as string) ||
        "";

      const tableName = rawTable.trim();
      const columnName = rawColumn.trim();
      if (!tableName || !columnName) continue;

      const table =
        tableMap.get(tableName) ||
        (() => {
          const fallback: PowerBiTable = { name: tableName, columns: [] };
          tableMap.set(tableName, fallback);
          return fallback;
        })();

      if (!Array.isArray(table.columns)) table.columns = [];
      if (!table.columns.some((col) => col.name === columnName)) {
        table.columns.push({ name: columnName });
      }
    }

    return Array.from(tableMap.values()).filter(
      (table) => Array.isArray(table.columns) && table.columns.length > 0
    );
  } catch (err) {
    console.warn("Power BI DMV metadata fallback failed:", err);
    return manualPowerBiTables.length
      ? manualPowerBiTables.map((table) => ({
          name: table.name,
          columns: table.columns
            ? table.columns.map((col) => ({ ...col }))
            : []
        }))
      : [];
  }
}

async function getDatasetTables(
  accessToken: string,
  datasetId: string
): Promise<PowerBiTable[]> {
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/tables`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");

    if (
      res.status === 404 &&
      /not Push API dataset/i.test(detail || "")
    ) {
      console.info(
        "Dataset tables endpoint unavailable for non-Push dataset. Falling back to DMV metadata."
      );
      return getDatasetTablesFromMetadata(accessToken, datasetId);
    }

    throw new Error(
      `Failed to fetch dataset tables: ${res.status} ${res.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }

  const data = await res.json();
  const tables = Array.isArray(data?.value)
    ? data.value.map((item: any) => ({
        name: item?.name,
        columns: Array.isArray(item?.columns)
          ? item.columns.map((col: any) => ({ name: col?.name }))
          : []
      }))
    : [];

  if (!tables.length && manualPowerBiTables.length) {
    console.info("Using manual Power BI table definitions fallback.");
    return manualPowerBiTables.map((table) => ({
      name: table.name,
      columns: table.columns
        ? table.columns.map((col) => ({ ...col }))
        : []
    }));
  }

  return tables;
}

async function listReportPages(accessToken: string): Promise<PowerBiPage[]> {
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}/pages`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Failed to list report pages: ${res.status} ${res.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }

  const data = await res.json();
  return Array.isArray(data?.value) ? data.value : [];
}

async function listPageVisuals(
  accessToken: string,
  pageName: string
): Promise<PowerBiVisual[]> {
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}/pages/${encodeURIComponent(
    pageName
  )}/visuals`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Failed to list visuals for page ${pageName}: ${res.status} ${
        res.statusText
      }${detail ? ` - ${detail}` : ""}`
    );
  }

  const data = await res.json();
  return Array.isArray(data?.value) ? data.value : [];
}

async function pollExportUntilReady(
  accessToken: string,
  statusUrl: string,
  attempts = 10,
  delayMs = 2000
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!statusRes.ok) {
      const detail = await statusRes.text().catch(() => "");
      throw new Error(
        `Failed to poll export status: ${statusRes.status} ${statusRes.statusText}${
          detail ? ` - ${detail}` : ""
        }`
      );
    }

    const statusJson = await statusRes.json();
    const state =
      (statusJson?.status as string | undefined)?.toLowerCase() ?? "unknown";

    if (state === "succeeded") {
      const resourceLocation =
        statusJson?.resourceLocation ??
        statusJson?.result?.resourceLocation ??
        "";
      if (!resourceLocation) {
        console.warn(
          "Export succeeded but resourceLocation missing in status payload."
        );
        return null;
      }

      const downloadUrl = resourceLocation.startsWith("http")
        ? resourceLocation
        : `https://api.powerbi.com${resourceLocation}`;

      const fileRes = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "text/csv"
        }
      });

      if (!fileRes.ok) {
        const detail = await fileRes.text().catch(() => "");
        throw new Error(
          `Failed to download export result: ${fileRes.status} ${
            fileRes.statusText
          }${detail ? ` - ${detail}` : ""}`
        );
      }

      const buffer = Buffer.from(await fileRes.arrayBuffer());
      return buffer.toString("utf8");
    }

    if (state === "failed" || state === "cancelled") {
      throw new Error(
        `Export failed with status "${statusJson?.status}". Details: ${JSON.stringify(
          statusJson
        )}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.warn("Export polling timed out before completion.");
  return null;
}

async function exportVisualCsv(
  accessToken: string,
  pageName: string,
  visualName: string
): Promise<string | null> {
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}/ExportTo`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      format: "CSV",
      pageName,
      visualName
    })
  });

  if (res.status !== 202) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ExportTo request failed: ${res.status} ${res.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }

  const statusUrl = res.headers.get("location");
  if (!statusUrl) {
    throw new Error("ExportTo response missing Location header for polling.");
  }

  return pollExportUntilReady(accessToken, statusUrl);
}

function summarizeCsv(csvText: string, maxLines = 15): string {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) return "No rows returned.";
  const limited = lines.slice(0, maxLines);
  const truncated = limited.join("\n");

  if (lines.length > maxLines) {
    return `${truncated}\n... (${lines.length - maxLines} more rows truncated)`;
  }

  return truncated;
}

function summarizeJsonArray(data: any[], maxRows = 10): string {
  if (!Array.isArray(data) || !data.length) return "No rows returned.";

  const sampled = data.slice(0, maxRows);
  const columnSet = new Set<string>();
  for (const row of sampled) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      Object.keys(row as Record<string, unknown>).forEach((key) =>
        columnSet.add(key)
      );
    }
  }

  const columns =
    columnSet.size > 0
      ? Array.from(columnSet)
      : sampled[0] && typeof sampled[0] === "object"
        ? Object.keys(sampled[0] as Record<string, unknown>)
        : ["value"];

  const header = columns.join(" | ");
  const rows = sampled.map((row) => {
    if (row && typeof row === "object") {
      return columns
        .map((col) =>
          formatCellValue(
            (row as Record<string, unknown>)[col as keyof typeof row]
          )
        )
        .join(" | ");
    }

    return formatCellValue(row);
  });

  let result = [header, ...rows].join("\n");
  if (data.length > maxRows) {
    result += `\n... (${data.length - maxRows} more rows truncated)`;
  }

  return result;
}

async function loadSnapshotFromFile(): Promise<string | null> {
  if (!snapshotPath) return null;

  try {
    const resolvedPath = path.isAbsolute(snapshotPath)
      ? snapshotPath
      : path.join(process.cwd(), snapshotPath);
    const raw = await fs.readFile(resolvedPath, "utf8");
    const lower = snapshotPath.toLowerCase();

    if (lower.endsWith(".json")) {
      const parsed = JSON.parse(raw);
      const arrayData = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
          ? parsed.data
          : Array.isArray(parsed?.rows)
            ? parsed.rows
            : null;

      if (arrayData) {
        const summary = summarizeJsonArray(arrayData);
        return `Snapshot "${snapshotPath}" sample:\n${summary}`;
      }

      const preview =
        typeof parsed === "object"
          ? JSON.stringify(parsed, null, 2).slice(0, 800)
          : String(parsed).slice(0, 800);
      return `Snapshot "${snapshotPath}" (JSON preview):\n${preview}`;
    }

    const summary = summarizeCsv(raw);
    return `Snapshot "${snapshotPath}" sample:\n${summary}`;
  } catch (err) {
    console.warn("Snapshot file fallback failed:", err);
    return null;
  }
}

async function fetchVisualSampleData(
  accessToken: string
): Promise<string | null> {
  try {
    const pages = await listReportPages(accessToken);
    if (!pages.length) return null;

    const preferredPairs: { page: PowerBiPage; visual: PowerBiVisual }[] = [];

    if (pageNameOverride && visualNameOverride) {
      const page = pages.find(
        (p) =>
          p.name === pageNameOverride || p.displayName === pageNameOverride
      );
      if (page) {
        const visuals = await listPageVisuals(accessToken, page.name);
        const visual = visuals.find(
          (v) =>
            v.name === visualNameOverride ||
            v.displayName === visualNameOverride
        );
        if (visual) {
          preferredPairs.push({ page, visual });
        } else {
          console.warn(
            `Configured visual ${visualNameOverride} not found on page ${page.name}.`
          );
        }
      } else {
        console.warn(
          `Configured page ${pageNameOverride} not found in report.`
        );
      }
    }

    if (!preferredPairs.length) {
      const tableLikeTypes = new Set([
        "tableEx",
        "table",
        "pivotTable",
        "matrix",
        "pivot"
      ]);

      for (const page of pages.slice(0, 3)) {
        try {
          const visuals = await listPageVisuals(accessToken, page.name);
          const candidate = visuals.find((visual) =>
            visual?.type ? tableLikeTypes.has(visual.type) : false
          );
          if (candidate) {
            preferredPairs.push({ page, visual: candidate });
          }
        } catch (err) {
          console.warn(
            `Failed to enumerate visuals for page ${page.name}:`,
            err
          );
        }
      }
    }

    for (const pair of preferredPairs) {
      try {
        const csv = await exportVisualCsv(
          accessToken,
          pair.page.name,
          pair.visual.name
        );
        if (csv) {
          const summary = summarizeCsv(csv);
          return [
            `Visual "${pair.visual.displayName ?? pair.visual.name}" on page "${
              pair.page.displayName ?? pair.page.name
            }" (CSV export):`,
            summary
          ].join("\n");
        }
      } catch (err) {
        console.warn(
          `Unable to export visual ${pair.visual.name} on page ${pair.page.name}:`,
          err
        );
      }
    }
  } catch (err) {
    console.warn("Visual export fallback failed:", err);
  }

  return null;
}

function quoteTableName(name: string) {
  const escaped = name.replace(/'/g, "''");
  return `'${escaped}'`;
}

function formatColumnIdentifier(table: string, column: string) {
  const safeColumn = column.replace(/]/g, "]]");
  return `${quoteTableName(table)}[${safeColumn}]`;
}

function formatCellValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

async function executeSampleQuery(
  accessToken: string,
  datasetId: string,
  table: PowerBiTable
): Promise<string | null> {
  const tableName = table.name;
  const columns = Array.isArray(table.columns)
    ? table.columns.map((c) => c?.name).filter(Boolean)
    : [];

  if (!columns.length) {
    console.warn(`Table ${tableName} has no columns metadata.`);
    return null;
  }

  const selectedColumns = columns.slice(0, 5);
  const columnRefs = selectedColumns.map((col) =>
    formatColumnIdentifier(tableName, col!)
  );
  const orderRef = columnRefs[0];

  const summarize = `SUMMARIZECOLUMNS(${columnRefs.join(", ")})`;
  const dax = `EVALUATE TOPN(10, ${summarize}, ${orderRef}, ASC)`;
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/executeQueries`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      queries: [{ query: dax }],
      serializerSettings: { includeNulls: true }
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn(
      `Power BI query failed for table ${tableName}: ${res.status} ${res.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
    return null;
  }

  const data = await res.json();
  const resultTable = data?.results?.[0]?.tables?.[0];
  if (
    !resultTable ||
    !Array.isArray(resultTable?.columns) ||
    !Array.isArray(resultTable?.rows)
  ) {
    return null;
  }

  const resultColumns: string[] = resultTable.columns.map(
    (c: any) => c?.name || "col"
  );
  const rows = Array.isArray(resultTable.rows)
    ? resultTable.rows.slice(0, 5)
    : [];

  const formattedRows = rows.map((row: any) => {
    if (Array.isArray(row)) {
      return resultColumns
        .map((_, idx) => formatCellValue(row[idx]))
        .join(" | ");
    }
    if (row && typeof row === "object") {
      return resultColumns.map((col) => formatCellValue((row as any)[col])).join(" | ");
    }
    return formatCellValue(row);
  });

  return [
    `Table: ${tableName}`,
    resultColumns.join(" | "),
    ...formattedRows
  ].join("\n");
}

async function buildPowerBiContext(): Promise<string | null> {
  if (!powerBiConfigured) return null;

  try {
    const token = await getPowerBiToken();
    if (!token) return null;

    const meta = await getReportMetadata(token);
    if (!meta) return null;

    let contextFragments: string[] = [];

    if (daxSamplingEnabled) {
      try {
        const tables = await getDatasetTables(token, meta.datasetId);
        if (tables.length) {
          const samples = [];
          for (const table of tables.slice(0, 3)) {
            const sample = await executeSampleQuery(
              token,
              meta.datasetId,
              table
            );
            if (sample) samples.push(sample);
          }

          if (samples.length) {
            contextFragments = samples;
          }
        }
      } catch (daxErr) {
        console.warn("Power BI DAX sampling failed:", daxErr);
      }
    } else {
      console.info("Skipping Power BI DAX sampling (POWER_BI_DISABLE_DAX enabled).");
    }

    if (!contextFragments.length) {
      const visualSample = await fetchVisualSampleData(token);
      if (visualSample) {
        contextFragments.push(visualSample);
      }
    }

    if (!contextFragments.length) {
      const snapshotSample = await loadSnapshotFromFile();
      if (snapshotSample) {
        contextFragments.push(snapshotSample);
      }
    }

    if (!contextFragments.length) {
      return `Report "${meta.name}" (dataset ${meta.datasetId}) is available, but sample data could not be retrieved.`;
    }

    return [
      `Report "${meta.name}" (dataset ${meta.datasetId}) sample data:`,
      ...contextFragments
    ].join("\n\n");
  } catch (err) {
    console.warn("Power BI context build failed:", err);
    return null;
  }
}

export async function POST(req: Request) {
  if (!endpoint || !deployment || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Azure OpenAI environment variables are missing. Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT, and AZURE_OPENAI_API_KEY."
      },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const messages = Array.isArray((body as any)?.messages)
    ? ((body as any).messages as ChatMessage[])
    : null;

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "messages array is required." },
      { status: 400 }
    );
  }

  const systemPrompt: ChatMessage = {
    role: "system",
    content:
      "You are Daisy, PSA's conversational analyst. Interpret Power BI exports, respect the provided filters, and answer in concise business language with suggested next actions."
  };

  const azureMessages: ChatMessage[] = [
    systemPrompt,
    ...messages.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: String(msg.content ?? "")
    }))
  ];

  const powerBiContext = await buildPowerBiContext();
  if (powerBiContext) {
    azureMessages.splice(1, 0, {
      role: "user",
      content: `Power BI context:\n${powerBiContext}`
    });
  }

  const url = `${endpoint}/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const azureResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        messages: azureMessages,
        temperature: 0.2,
        max_tokens: 700,
        top_p: 0.9
      })
    });

    if (!azureResponse.ok) {
      const errorDetail = await azureResponse.json().catch(() => null);
      return NextResponse.json(
        {
          error: "Azure OpenAI request failed.",
          detail: errorDetail || azureResponse.statusText
        },
        { status: 502 }
      );
    }

    const data = await azureResponse.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I wasn't able to generate an insight.";

    return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected server error.", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
