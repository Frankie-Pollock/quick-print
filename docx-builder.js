// docx-builder.js

document.getElementById("build").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const address = document.getElementById("address").value.trim();
  const file = document.getElementById("docx-file").files[0];

  if (!address) {
    status.textContent = "Enter a replacement address.";
    return;
  }
  if (!file) {
    status.textContent = "Select a DOCX file.";
    return;
  }

  const scan = JSON.parse(localStorage.getItem("scanResults") || "{}");
  const count = scan.countForReports || 0;

  status.textContent = "Reading DOCX...";

  const buffer = await file.arrayBuffer();

  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const parser = new DOMParser();
  const doc = parser.parseFromString("<div id='root'>" + html + "</div>", "text/html");

  const root = doc.getElementById("root");

  const search = "6 Garry Place Falkirk";
  const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const toEdit = [];

  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (re.test(n.nodeValue)) toEdit.push(n);
  }

  toEdit.forEach(n => n.nodeValue = n.nodeValue.replace(re, address));

  const tables = Array.from(root.querySelectorAll("table"));
  if (tables.length < 2) {
    status.textContent = "Expected at least 2 pages in DOCX.";
    return;
  }

  const page2 = tables[1];

  for (let i = 0; i < count; i++) {
    const c = page2.cloneNode(true);
    page2.parentNode.insertBefore(c, page2.nextSibling);
  }

  const { Document, Table, TableRow, TableCell, Paragraph, WidthType, Packer } = docx;

  const buildTable = (tbl) => {
    const rows = Array.from(tbl.querySelectorAll("tr")).map(tr => {
      const cells = Array.from(tr.querySelectorAll("th,td")).map(td => {
        const text = td.innerText || "";
        return new TableCell({
          children: [new Paragraph(text)],
        });
      });
      return new TableRow({ children: cells });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows
    });
  };

  const docxTables = tables.map(buildTable);

  const children = [];
  docxTables.forEach(t => children.push(t));

  const newDoc = new Document({
    sections: [{ children }]
  });

  status.textContent = "Building DOCX...";

  const blob = await Packer.toBlob(newDoc);

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "modified.docx";
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 3000);

  status.textContent = "Done.";
});
