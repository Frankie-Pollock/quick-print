// pdf-scan.js (Chunk 1)

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.6.172/build/pdf.worker.js";

const TOP_LINES = 45;
const TOP_CHARS = 3500;

// Aggressive fuzzy detection
const TRADE_FUZZY = /Tr[a-z0-9 ]{0,4}[dclo0e]{1}[e ]{0,2}[:;]\s*/i;
const PA_FUZZY = /PA\b/i;
const LB_FUZZY = /LB\b/i;

const HEADER_FUZZY = [
  /Falkirk/i,
  /JOB\s*T[I1]CKET/i,
  /Work\s*Programme/i,
  /VOID/i,
  /Printed\s*Date/i,
  /Issued\s*Date/i,
  /Target\s*Date/i
];

const STOP_AT = /HEALTH\s+AND\s+SAFETY\s+CHECK\s*LIST/i;
const BLOCKERS = [
  /Job\s+Visit\s+Details\s+for/i,
  /Additional\s+Info/i
];

document.getElementById("run").onclick = async () => {
  const mode = document.getElementById("mode").value;
  const file = document.getElementById("pdf-file").files[0];
  const status = document.getElementById("status");

  if (!file) {
    status.textContent = "Please select a PDF.";
    return;
  }

  status.textContent = "Loading PDF...";
  const bytes = new Uint8Array(await file.arrayBuffer());
  localStorage.setItem("pdfBytes", JSON.stringify(Array.from(bytes)));

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const images = [];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 2.0 });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    images.push(canvas.toDataURL("image/png"));
    status.textContent = `Rendered page ${p}`;
  }

  status.textContent = "OCR running...";

  const worker = await Tesseract.createWorker();
  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const pageText = [];
  const topBlocks = [];

  for (let i = 0; i < images.length; i++) {
    const result = await worker.recognize(images[i]);
    const text = result.data.text;
    pageText.push(text);

    const block = text.split(/\n/).slice(0, TOP_LINES).join("\n").slice(0, TOP_CHARS);
    topBlocks.push(block);

    status.textContent = `OCR page ${i + 1}/${images.length}`;
  }

  await worker.terminate();

  let count = 0;
  let selectedPages = [];

  if (mode === "ACGOLD") {
    let i = 0;
    while (i < topBlocks.length) {
      const block = topBlocks[i];
      const tradeMatch = TRADE_FUZZY.test(block);

      // Trade must be PA or LB
      const isPA = PA_FUZZY.test(block);
      const isLB = LB_FUZZY.test(block);

      if (tradeMatch && (isPA || isLB)) {
        // Check blockers
        const tPos = block.search(TRADE_FUZZY);
        let blocked = false;
        for (const b of BLOCKERS) {
          const bPos = block.search(b);
          if (bPos >= 0 && (bPos < tPos || tPos < 0)) blocked = true;
        }

        if (!blocked) {
          const start = i;
          let end = i;
          for (let j = i; j < topBlocks.length; j++) {
            end = j;
            if (STOP_AT.test(topBlocks[j])) break;
          }
          count++;
          for (let k = start; k <= end; k++) selectedPages.push(k + 1);
          i = end + 1;
          continue;
        }
      }
      i++;
    }
  } else {
    // BMD: count any fuzzy trade
    for (const txt of pageText) {
      const matches = txt.match(/Trade/gi);
      if (matches) count += matches.length;
    }
    selectedPages = pageText.map((_, i) => i + 1);
  }

  localStorage.setItem("scanResults", JSON.stringify({
    countForReports: count,
    selectedPages,
    pageCount: pageText.length
  }));

  status.textContent = `Done. Count=${count}`;
};
// pdf-scan.js (Chunk 2)

// Helper to update UI when needed
function updateStatus(msg) {
  const s = document.getElementById("status");
  if (s) s.textContent = msg;
}

// Optional: show simple results summary on scan page
function displaySummary(count, selectedPages) {
  const s = document.getElementById("status");
  if (!s) return;
  s.textContent = `Done. Found ${count} result(s). Bundle pages = [${selectedPages.join(", ")}]`;
}

// Store results for next page
function storeResults(bytes, count, selectedPages, pageCount) {
  localStorage.setItem("scanResults", JSON.stringify({
    countForReports: count,
    selectedPages,
    pageCount
  }));
  localStorage.setItem("pdfBytes", JSON.stringify(Array.from(bytes)));
}
// pdf-scan.js (Chunk 3 — Wrapper Logic)

async function runScan() {
  const mode = document.getElementById("mode").value;
  const file = document.getElementById("pdf-file").files[0];
  const status = document.getElementById("status");

  if (!file) {
    updateStatus("Please select a PDF.");
    return;
  }

  updateStatus("Loading PDF...");
  const bytes = new Uint8Array(await file.arrayBuffer());

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  const images = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Render pages → images
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 2.0 });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    images.push(canvas.toDataURL("image/png"));
    updateStatus(`Rendered page ${p}/${pdf.numPages}`);
  }

  // OCR
  updateStatus("Running OCR...");

  const worker = await Tesseract.createWorker();
  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const pageText = [];
  const topBlocks = [];

  for (let i = 0; i < images.length; i++) {
    const result = await worker.recognize(images[i]);
    const text = result.data.text;
    pageText.push(text);

    const tb = text.split(/\n/).slice(0, TOP_LINES).join("\n").slice(0, TOP_CHARS);
    topBlocks.push(tb);

    updateStatus(`OCR ${i + 1}/${images.length}`);
  }

  await worker.terminate();

  // Analysis
  let count = 0;
  let selectedPages = [];

  if (mode === "ACGOLD") {
    let i = 0;
    while (i < topBlocks.length) {
      const block = topBlocks[i];
      const trade = TRADE_FUZZY.test(block);
      const pa = PA_FUZZY.test(block);
      const lb = LB_FUZZY.test(block);

      if (trade && (pa || lb)) {
        let blocked = false;
        const tradePos = block.search(TRADE_FUZZY);

        for (const b of BLOCKERS) {
          const pos = block.search(b);
          if (pos >= 0 && (pos < tradePos || tradePos < 0)) {
            blocked = true;
          }
        }

        if (!blocked) {
          const start = i;
          let end = i;
          for (let j = i; j < topBlocks.length; j++) {
            end = j;
            if (STOP_AT.test(topBlocks[j])) break;
          }
          count++;
          for (let k = start; k <= end; k++) selectedPages.push(k + 1);
          i = end + 1;
          continue;
        }
      }

      i++;
    }
  } else {
    for (const txt of pageText) {
      const matches = txt.match(/Trade/gi);
      if (matches) count += matches.length;
    }
    selectedPages = pageText.map((_, idx) => idx + 1);
  }

  storeResults(bytes, count, selectedPages, pageText.length);

  displaySummary(count, selectedPages);
  updateStatus(`Scan complete. Count = ${count}.`);
}

// Bind UI
document.getElementById("run").addEventListener("click", runScan);
