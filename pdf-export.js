// pdf-export.js

document.getElementById("build").addEventListener("click", async () => {
  const status = document.getElementById("status");

  const scan = JSON.parse(localStorage.getItem("scanResults") || "{}");
  const savedBytes = JSON.parse(localStorage.getItem("pdfBytes") || "[]");

  if (!scan || !savedBytes.length) {
    status.textContent = "No PDF data found. Please run scanning first.";
    return;
  }

  const { selectedPages, pageCount } = scan;
  const mode = scan.selectedPages.length === scan.pageCount ? "BMD" : "ACGOLD";

  const bytes = new Uint8Array(savedBytes);
  const { PDFDocument } = PDFLib;

  status.textContent = "Loading PDF...";

  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();

  if (mode === "ACGOLD") {
    for (const p of selectedPages) {
      const [copy] = await out.copyPages(src, [p - 1]);
      out.addPage(copy);
    }
  } else {
    const total = src.getPageCount();
    const all = Array.from({ length: total }, (_, i) => i);
    const pages = await out.copyPages(src, all);
    pages.forEach(pg => out.addPage(pg));
  }

  status.textContent = "Saving...";

  const finalBytes = await out.save();
  const blob = new Blob([finalBytes], { type: "application/pdf" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = mode === "ACGOLD" ? "acgold-extracted.pdf" : "bmd-full.pdf";
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 3000);

  status.textContent = "Download complete.";
});
