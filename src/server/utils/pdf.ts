import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    useSystemFonts: true,
  } as any);
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => (item as { str: string }).str).join(" ");
    pages.push(pageText);
  }

  const text = pages.join("\n").trim();
  if (!text) {
    throw new Error("No text could be extracted from the PDF. The PDF may be scanned or image-based.");
  }
  return text;
}
