// js/services/receipt.js
// WhatsApp & Digital Receipt Engine for Dripp Medicos POS
// Generates thermal receipt previews and WhatsApp sharing links.

import { state, getState } from '../state.js';
import { fmtCurrency, formatDateTime } from '../config.js';
import { showToast } from '../ui.js';

// ============================================================
// Receipt Template Generator
// ============================================================

export function generateReceiptHTML(sale, options = {}) {
  const { includeWhatsApp = true, includeQR = true, thermalWidth = 320 } = options;
  
  const timestamp = formatDateTime(sale.timestamp || sale.createdAt);
  const saleId = sale.saleId || sale.id || '—';
  const cashier = sale.cashier || '—';
  const patient = sale.patient?.name || sale.customer?.name || 'Walk-in Customer';
  const doctor = sale.doctor || sale.patient?.doctor || sale.customer?.doctor || '—';
  const payment = sale.payment || 'Cash';
  const items = Array.isArray(sale.items) ? sale.items : [];
  
  const grossTotal = Number(sale.grossTotal ?? sale.subtotal ?? 0);
  const discount = Number(sale.discount ?? 0);
  const netTotal = Number(sale.netTotal ?? sale.total ?? 0);
  const cashReceived = Number(sale.cashReceived ?? 0);
  const changeDue = Number(sale.changeDue ?? 0);
  
  const itemRows = items.map(item => {
    const name = item.name || '—';
    const qty = Number(item.qty || item.quantity || 1);
    const unit = item.unit || 'Unit';
    const unitPrice = Number(item.unitPrice || item.price || 0);
    const subtotal = Number(item.subtotal || (qty * unitPrice));
    return `
      <tr style="border-bottom: 1px dashed #ccc;">
        <td style="padding: 4px 0; font-size: 11px;">${escapeHtml(name)}</td>
        <td style="padding: 4px 0; font-size: 11px; text-align: right;">${qty} × ${unit}</td>
        <td style="padding: 4px 0; font-size: 11px; text-align: right;">${fmtCurrency(unitPrice)}</td>
        <td style="padding: 4px 0; font-size: 11px; text-align: right;">${fmtCurrency(subtotal)}</td>
      </tr>
    `;
  }).join('');
  
  const whatsappLink = includeWhatsApp ? generateWhatsAppLink(sale) : '';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt - ${saleId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Courier New', Courier, monospace; 
      background: #fff; 
      color: #000; 
      padding: 20px;
      max-width: ${thermalWidth}px;
      margin: 0 auto;
    }
    .receipt { 
      border: 1px solid #ddd; 
      padding: 15px; 
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header { text-align: center; margin-bottom: 15px; }
    .logo { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
    .tagline { font-size: 10px; color: #666; }
    .divider { border-top: 1px dashed #999; margin: 10px 0; }
    .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; }
    .info-label { color: #666; }
    .info-value { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
    th { text-align: left; padding: 4px 0; border-bottom: 1px solid #333; font-size: 10px; }
    .totals { margin-top: 10px; font-size: 11px; }
    .total-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .grand-total { font-size: 13px; font-weight: bold; border-top: 1px solid #333; padding-top: 5px; }
    .payment-info { margin-top: 10px; font-size: 10px; }
    .footer { text-align: center; margin-top: 15px; font-size: 9px; color: #888; }
    .whatsapp-btn {
      display: inline-block;
      background: #25D366;
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      text-decoration: none;
      font-weight: bold;
      margin: 10px 0;
      text-align: center;
    }
    .qr-code { text-align: center; margin: 10px 0; }
    @media print {
      body { padding: 0; max-width: none; }
      .receipt { border: none; box-shadow: none; border-radius: 0; }
      .whatsapp-btn { display: none; }
    }
    @media (max-width: 400px) {
      body { padding: 10px; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">💊 Dripp Medicos</div>
      <div class="tagline">Gyno · Obs · Women's Health Pharmacy</div>
    </div>
    <div class="divider"></div>
    
    <div class="info-row"><span class="info-label">Invoice:</span> <span class="info-value">${escapeHtml(saleId)}</span></div>
    <div class="info-row"><span class="info-label">Date:</span> <span class="info-value">${escapeHtml(timestamp)}</span></div>
    <div class="info-row"><span class="info-label">Cashier:</span> <span class="info-value">${escapeHtml(cashier)}</span></div>
    <div class="info-row"><span class="info-label">Patient:</span> <span class="info-value">${escapeHtml(patient)}</span></div>
    <div class="info-row"><span class="info-label">Doctor:</span> <span class="info-value">${escapeHtml(doctor)}</span></div>
    <div class="info-row"><span class="info-label">Payment:</span> <span class="info-value">${escapeHtml(payment)}</span></div>
    
    <div class="divider"></div>
    
    <table>
      <thead>
        <tr>
          <th style="width: 40%;">Item</th>
          <th style="width: 15%; text-align: right;">Qty</th>
          <th style="width: 20%; text-align: right;">Price</th>
          <th style="width: 25%; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    
    <div class="divider"></div>
    
    <div class="totals">
      <div class="total-row"><span>Gross Total:</span> <span>${fmtCurrency(grossTotal)}</span></div>
      ${discount > 0 ? `<div class="total-row"><span>Discount:</span> <span>-${fmtCurrency(discount)}</span></div>` : ''}
      <div class="total-row grand-total"><span>Net Payable:</span> <span>${fmtCurrency(netTotal)}</span></div>
    </div>
    
    <div class="payment-info">
      <div class="total-row"><span>Paid (${escapeHtml(payment)}):</span> <span>${fmtCurrency(cashReceived)}</span></div>
      ${changeDue > 0 ? `<div class="total-row"><span>Change:</span> <span>${fmtCurrency(changeDue)}</span></div>` : ''}
    </div>
    
    ${whatsappLink ? `
    <div style="text-align: center;">
      <a href="${whatsappLink}" class="whatsapp-btn" target="_blank" rel="noopener">
        📱 Send via WhatsApp
      </a>
    </div>
    ` : ''}
    
    ${includeQR ? `
    <div class="qr-code">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(window.location.origin + '#sales')}" alt="QR Code" style="max-width: 120px;">
      <div style="font-size: 8px; color: #888; margin-top: 4px;">Scan for digital copy</div>
    </div>
    ` : ''}
    
    <div class="footer">
      <div>Thank you for choosing Dripp Medicos</div>
      <div>For queries, contact us with Invoice: ${escapeHtml(saleId)}</div>
      <div style="margin-top: 5px;">${new Date().toLocaleString()}</div>
    </div>
  </div>
  
  <script>
    // Auto-print if opened in print mode
    if (window.location.search.includes('print=1')) {
      window.onload = () => window.print();
    }
  </script>
</body>
</html>
  `.trim();
}

function generateWhatsAppLink(sale) {
  const saleId = sale.saleId || sale.id || '—';
  const timestamp = formatDateTime(sale.timestamp || sale.createdAt);
  const netTotal = Number(sale.netTotal ?? sale.total ?? 0);
  const patient = sale.patient?.name || sale.customer?.name || 'Walk-in Customer';
  
  const message = `💊 *Dripp Medicos - Receipt*\n\n` +
    `Invoice: ${saleId}\n` +
    `Date: ${timestamp}\n` +
    `Patient: ${patient}\n` +
    `Total: ${fmtCurrency(netTotal)}\n\n` +
    `Thank you for choosing Dripp Medicos!`;
  
  // This would need a phone number - using a placeholder
  // In real implementation, get from sale.patient?.phone or sale.customer?.phone
  const phone = sale.patient?.phone || sale.customer?.phone || '';
  
  if (phone) {
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
  }
  
  // Fallback: open WhatsApp Web with pre-filled message (user selects contact)
  return `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

// ============================================================
// Print & Share Functions
// ============================================================

export function printReceipt(sale) {
  const html = generateReceiptHTML(sale, { includeWhatsApp: false, includeQR: false });
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

export function openReceiptInNewTab(sale) {
  const html = generateReceiptHTML(sale);
  const tab = window.open('', '_blank');
  tab.document.write(html);
  tab.document.close();
}

export function shareReceiptViaWhatsApp(sale) {
  const link = generateWhatsAppLink(sale);
  if (link) {
    window.open(link, '_blank');
    showToast('Opening WhatsApp...', 'info');
  } else {
    showToast('No phone number available for WhatsApp', 'warn');
  }
}

export function downloadReceiptAsHTML(sale) {
  const html = generateReceiptHTML(sale, { includeWhatsApp: false });
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${sale.saleId || sale.id || 'receipt'}-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Receipt downloaded', 'success');
}

// Helper
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

export { generateReceiptHTML as default };