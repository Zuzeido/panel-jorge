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

function createPdfBuffer(draw, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 42,
      size: 'A4',
      ...options
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
  const orderedRows = [...products]
    .sort((a, b) => a.title.localeCompare(b.title, 'es'))
    .flatMap((product) => {
      const orderedVariants = [...(product.variants || [])].sort((a, b) =>
        a.title.localeCompare(b.title, 'es')
      );

      if (!orderedVariants.length) {
        return [
          {
            product: product.title,
            collections: product.collections?.join(', ') || 'Sin coleccion',
            variant: '-',
            sku: '-',
            price: product.price || '0.00',
            stock: product.totalInventory ?? 0
          }
        ];
      }

      return orderedVariants.map((variant, index) => ({
        product: index === 0 ? product.title : '',
        collections: index === 0 ? product.collections?.join(', ') || 'Sin coleccion' : '',
        variant: variant.title || 'Variante',
        sku: variant.sku || '-',
        price: variant.price || '0.00',
        stock: variant.inventoryQuantity ?? 0
      }));
    });

  return createPdfBuffer((doc) => {
    drawHeader(
      doc,
      'Recycled J - Informe de stock actual',
      `Generado el ${formatDate(generatedAt)}`
    );

    const columns = [
      { key: 'product', label: 'Producto', width: 165, align: 'left' },
      { key: 'collections', label: 'Colecciones', width: 150, align: 'left' },
      { key: 'variant', label: 'Variante', width: 150, align: 'left' },
      { key: 'sku', label: 'SKU', width: 95, align: 'left' },
      { key: 'price', label: 'Precio', width: 70, align: 'right' },
      { key: 'stock', label: 'Stock', width: 60, align: 'right' }
    ];

    const tableLeft = doc.page.margins.left;
    const rowHeight = 22;

    function drawTableHeader() {
      ensureSpace(doc, 34);
      let x = tableLeft;
      const y = doc.y;

      doc
        .rect(tableLeft, y, columns.reduce((sum, column) => sum + column.width, 0), rowHeight)
        .fill('#e8efe8');
      doc.fillColor('#17324d').font('Helvetica-Bold').fontSize(9);

      columns.forEach((column) => {
        doc.text(column.label, x + 6, y + 7, {
          width: column.width - 12,
          align: column.align
        });
        x += column.width;
      });

      doc.y = y + rowHeight + 4;
    }

    drawTableHeader();

    orderedRows.forEach((row, index) => {
      ensureSpace(doc, rowHeight + 6);
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawTableHeader();
      }

      const y = doc.y;
      const fill = index % 2 === 0 ? '#f8faf8' : '#eef3ee';
      doc
        .rect(tableLeft, y, columns.reduce((sum, column) => sum + column.width, 0), rowHeight)
        .fill(fill);

      let x = tableLeft;
      doc.fillColor('#243c31').font('Helvetica').fontSize(8.5);
      columns.forEach((column) => {
        const value =
          column.key === 'price'
            ? formatMoney(row.price)
            : column.key === 'stock'
              ? `${row.stock} uds.`
              : row[column.key];
        doc.text(String(value || ''), x + 6, y + 7, {
          width: column.width - 12,
          align: column.align,
          ellipsis: true
        });
        x += column.width;
      });

      doc.y = y + rowHeight + 2;
    });
  }, { layout: 'landscape' });
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
