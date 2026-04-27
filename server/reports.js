import PDFDocument from 'pdfkit';

function formatMoney(value, currencyCode = 'EUR') {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currencyCode
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function monthLabel() {
  return new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric'
  }).format(new Date());
}

function createPdfBuffer(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 42,
      size: 'A4'
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    draw(doc);
    doc.end();
  });
}

function drawHeader(doc, title, subtitle) {
  doc
    .fontSize(22)
    .fillColor('#17324d')
    .text(title, { align: 'left' })
    .moveDown(0.25);

  doc
    .fontSize(10)
    .fillColor('#5f6f69')
    .text(subtitle)
    .moveDown(1);
}

function ensureSpace(doc, minHeight = 60) {
  if (doc.y + minHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 40);
  doc
    .fontSize(13)
    .fillColor('#1f3b30')
    .text(title)
    .moveDown(0.35);
}

function drawKeyValue(doc, left, right, options = {}) {
  const { leftWidth = 310, fontSize = 10, color = '#243c31', bold = false } = options;
  ensureSpace(doc, 22);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(color);
  doc.text(left, doc.page.margins.left, doc.y, { width: leftWidth });
  doc.text(String(right), doc.page.width - doc.page.margins.right - 180, doc.y - fontSize - 2, {
    width: 180,
    align: 'right'
  });
  doc.moveDown(0.35);
}

export async function buildStockReportPdf({ products, generatedAt }) {
  const orderedProducts = [...products].sort((a, b) => a.title.localeCompare(b.title, 'es'));

  return createPdfBuffer((doc) => {
    drawHeader(
      doc,
      'Recycled J - Informe de stock actual',
      `Generado el ${formatDate(generatedAt)}`
    );

    orderedProducts.forEach((product) => {
      const orderedVariants = [...(product.variants || [])].sort((a, b) =>
        a.title.localeCompare(b.title, 'es')
      );

      drawSectionTitle(doc, product.title);
      drawKeyValue(doc, 'Colecciones', product.collections?.join(', ') || 'Sin coleccion');
      drawKeyValue(doc, 'Stock total', `${product.totalInventory ?? 0} uds.`);
      drawKeyValue(doc, 'Estado', product.status || 'Sin estado');
      drawKeyValue(doc, 'Actualizado', formatDate(product.updatedAt));

      ensureSpace(doc, 26);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#17324d');
      doc.text('Variante', 42, doc.y, { width: 210 });
      doc.text('SKU', 252, doc.y - 10, { width: 110 });
      doc.text('Precio', 362, doc.y - 10, { width: 70, align: 'right' });
      doc.text('Stock', 432, doc.y - 10, { width: 80, align: 'right' });
      doc.moveDown(0.5);

      orderedVariants.forEach((variant) => {
        ensureSpace(doc, 18);
        doc.font('Helvetica').fontSize(9).fillColor('#243c31');
        doc.text(variant.title || 'Variante', 42, doc.y, { width: 210 });
        doc.text(variant.sku || '-', 252, doc.y - 9, { width: 110 });
        doc.text(formatMoney(variant.price), 362, doc.y - 9, { width: 70, align: 'right' });
        doc.text(`${variant.inventoryQuantity ?? 0} uds.`, 432, doc.y - 9, {
          width: 80,
          align: 'right'
        });
        doc.moveDown(0.35);
      });

      doc.moveDown(0.8);
    });
  });
}

export async function buildMonthlySalesReportPdf({ rows, summary, generatedAt }) {
  return createPdfBuffer((doc) => {
    drawHeader(
      doc,
      'Recycled J - Informe de ventas del mes',
      `Mes actual: ${monthLabel()} · generado el ${formatDate(generatedAt)}`
    );

    drawSectionTitle(doc, 'Resumen');
    drawKeyValue(doc, 'Pedidos del mes', summary.ordersCount, { bold: true });
    drawKeyValue(doc, 'Unidades vendidas', summary.units, { bold: true });
    drawKeyValue(doc, 'Facturacion del mes', formatMoney(summary.revenue, summary.currencyCode), {
      bold: true
    });

    drawSectionTitle(doc, 'Ventas por producto');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#17324d');
    doc.text('Producto', 42, doc.y, { width: 230 });
    doc.text('Pedidos', 272, doc.y - 10, { width: 60, align: 'right' });
    doc.text('Unidades', 332, doc.y - 10, { width: 70, align: 'right' });
    doc.text('Importe', 402, doc.y - 10, { width: 110, align: 'right' });
    doc.moveDown(0.6);

    rows.forEach((row) => {
      ensureSpace(doc, 18);
      doc.font('Helvetica').fontSize(9).fillColor('#243c31');
      doc.text(row.name, 42, doc.y, { width: 230 });
      doc.text(String(row.ordersCount), 272, doc.y - 9, { width: 60, align: 'right' });
      doc.text(String(row.units), 332, doc.y - 9, { width: 70, align: 'right' });
      doc.text(formatMoney(row.revenue, row.currencyCode), 402, doc.y - 9, {
        width: 110,
        align: 'right'
      });
      doc.moveDown(0.35);
    });
  });
}
