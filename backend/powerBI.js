import 'dotenv/config';
import fetch from 'node-fetch';

async function getAccessToken() {
  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('scope', 'https://analysis.windows.net/powerbi/api/.default');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await res.json();
  return data.access_token;
}

async function getDatasetTables(datasetId) {
  const token = await getAccessToken();
  const { WORKSPACE_ID } = process.env;

  const url = `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/datasets/${datasetId}/tables`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  console.log(data);
}


async function getReport() {
  const token = await getAccessToken();
  const { WORKSPACE_ID, REPORT_ID } = process.env;

  const url = `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/reports/${REPORT_ID}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  console.log(data)
  getDatasetTables(data.datasetId);	
}

getReport().catch(console.error);
