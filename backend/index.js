import 'dotenv/config';
import { getAccessToken } from './getAccessToken.js';
import { exportReportToFile } from './exportReportToFile.js';
import { pdfToImages } from "./pdfToImages.js";
import fs from 'fs';
import path from "path";

async function main() {
  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, WORKSPACE_ID, REPORT_ID } = process.env;

  const token = await getAccessToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
  //const fileBuffer = await exportReportToFile(token, WORKSPACE_ID, REPORT_ID);

  //fs.writeFileSync('report.pdf', fileBuffer);
  console.log('✅ Report exported and saved as report.pdf');
  const pdfPath = path.resolve("./report.pdf");
  const images = await pdfToImages(pdfPath);
}

main().catch(console.error);

