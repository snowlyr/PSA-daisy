export async function exportReportToFile(accessToken, groupId, reportId) {
  // 1. Start the export job
  const exportRes = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/ExportTo`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format: "PDF",   // You can use "PDF" or "PPTX" or "PNG"
      }),
    }
  );

  if (!exportRes.ok) {
    const err = await exportRes.text();
    throw new Error(`Failed to start export: ${err}`);
  }

  const exportData = await exportRes.json();
  const exportId = exportData.id;
  console.log(`✅ Export started: ${exportId}`);

  // 2. Poll the export job status
  let status;
  do {
    const pollRes = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/exports/${exportId}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    const pollData = await pollRes.json();
    status = pollData.status;
    console.log(`📡 Export status: ${status}`);

    if (status === "Failed") throw new Error(`Export failed: ${JSON.stringify(pollData)}`);
    if (status !== "Succeeded") await new Promise(r => setTimeout(r, 3000));
  } while (status !== "Succeeded");

  // 3. Download the file
  const fileRes = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/exports/${exportId}/file`,
    {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }
  );

  if (!fileRes.ok) {
    const err = await fileRes.text();
    throw new Error(`Failed to download file: ${err}`);
  }

  const buffer = await fileRes.arrayBuffer();
  return Buffer.from(buffer);
}

