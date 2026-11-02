import React, { useState, useEffect } from 'react';
import { Printer, X, Sliders, RefreshCw, Store, AlertCircle, Eye, AlignCenter } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

export interface InvoiceItem {
  id?: string;
  name: string;
  code?: string;
  barcode?: string;
  sku?: string;
  size?: string;
  color?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  saleType?: 'SALE' | 'RETURN';
  returnDate?: string | null;
}

export interface InvoiceData {
  invoiceId: string;
  invoiceCode?: string;
  saleDate: string;
  paymentMethod: string;
  customerPhone?: string;
  customerName?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  totalAmount: number;
  discountAmount: number;
  payableAmount: number;
  receivedAmount: number;
  dueAmount: number;
  changeAmount: number;
  paymentRows?: { method: string; amount: number }[];
  items: InvoiceItem[];
}

export interface InvoicePrintSettings {
  paperWidth: number; // physical paper roll width in mm (80mm standard or 58mm mini)
  contentWidth: number; // printable width in mm
  sideMargin: number; // in mm: equal left and right margin padding (default 2.5mm for 80mm, 1.0mm for 58mm)
  leftShift: number; // in mm: balance nudge left/right (-6mm to +6mm, default 0 for true center)
  verticalOffset: number; // in mm: top margin / feed (default 2mm)
  fontScale: number; // in % (default 108%)
  itemSpacing: number; // in mm (default 1.5mm)
  showLogo: boolean;
  logoSize: number; // in px: width of logo (default 185px for 80mm, 155px for 58mm)
  logoThreshold: number; // 120-240: threshold to convert logo to pure thermal black & white
  showStoreHeader: boolean;
  storeName: string;
  storeSubtitle: string;
  storeAddress: string;
  storePhone: string;
  showInvoiceDetails: boolean;
  showCustomerPhone: boolean;
  showBarcode?: boolean;
  showProductCode?: boolean;
  showPaymentBreakdown: boolean;
  footerText: string;
}

const DEFAULT_INVOICE_SETTINGS: InvoicePrintSettings = {
  paperWidth: 80, // Default to 80mm (Standard POS printer)
  contentWidth: 72,
  sideMargin: 2.5,
  leftShift: 0,
  verticalOffset: 0.8, // Compact 0.8mm top margin
  fontScale: 108,
  itemSpacing: 1.5,
  showLogo: true,
  logoSize: 120, // Compact neat logo width
  logoThreshold: 210, // Removes cream background noise
  showStoreHeader: true,
  storeName: 'Blue Dream',
  storeSubtitle: '',
  storeAddress: 'Laxmi Square - 2nd Floor, Jaldi, Banskhali',
  storePhone: '',
  showInvoiceDetails: true,
  showCustomerPhone: true,
  showBarcode: true,
  showProductCode: true,
  showPaymentBreakdown: true,
  footerText: 'Thank you for your shopping!'
};

const STORAGE_KEY = 'pos_invoice_print_settings_v19';

const getSavedInvoiceSettings = (): InvoicePrintSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_INVOICE_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load invoice print settings', e);
  }
  return DEFAULT_INVOICE_SETTINGS;
};

interface InvoicePrintModalProps {
  data: InvoiceData;
  onClose: () => void;
  onNewSale?: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ data, onClose, onNewSale }) => {
  const [settings, setSettings] = useState<InvoicePrintSettings>(getSavedInvoiceSettings);
  const [showTuning, setShowTuning] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'align' | 'logo' | 'text'>('align');
  const [monochromeLogo, setMonochromeLogo] = useState<string>('');

  // Process logo into pure thermal high-contrast monochrome (removes cream background noise)
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        const threshold = settings.logoThreshold || 210;
        let top = canvas.height, bottom = 0, left = canvas.width, right = 0;
        let hasBlack = false;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const gray = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
            if (gray < threshold) {
              d[idx] = 0;
              d[idx + 1] = 0;
              d[idx + 2] = 0;
              d[idx + 3] = 255;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
              if (x < left) left = x;
              if (x > right) right = x;
              hasBlack = true;
            } else {
              d[idx] = 255;
              d[idx + 1] = 255;
              d[idx + 2] = 255;
              d[idx + 3] = 0; // Pure transparent white
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);

        // Autocrop transparent/white empty outer border for zero wasted vertical gap
        if (hasBlack && bottom > top && right > left) {
          const cropCanvas = document.createElement('canvas');
          const pad = 1;
          const cropW = (right - left + 1) + pad * 2;
          const cropH = (bottom - top + 1) + pad * 2;
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            cropCtx.drawImage(canvas, left - pad, top - pad, cropW, cropH, 0, 0, cropW, cropH);
            setMonochromeLogo(cropCanvas.toDataURL('image/png'));
            return;
          }
        }
        setMonochromeLogo(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Monochrome conversion fallback:', err);
        setMonochromeLogo(logoImg);
      }
    };
    img.onerror = () => setMonochromeLogo(logoImg);
    img.src = logoImg;
  }, [settings.logoThreshold]);

  const updateSettings = (partial: Partial<InvoicePrintSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_INVOICE_SETTINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_INVOICE_SETTINGS));
  };

  const switchPaperWidth = (width: 80 | 58) => {
    if (width === 80) {
      updateSettings({ paperWidth: 80, contentWidth: 72, sideMargin: 2.5, leftShift: 0, logoSize: 120, fontScale: 108, verticalOffset: 0.8 });
    } else {
      updateSettings({ paperWidth: 58, contentWidth: 52, sideMargin: 1.0, leftShift: 0, logoSize: 105, fontScale: 105, verticalOffset: 0.8 });
    }
  };

  const applyPreset = (preset: 'centered' | 'fullwidth' | 'nudgeRight' | 'nudgeLeft') => {
    const is80 = (settings.paperWidth || 80) === 80;
    if (preset === 'centered') {
      updateSettings({ sideMargin: is80 ? 2.5 : 1.0, leftShift: 0, verticalOffset: 0.8, logoSize: is80 ? 120 : 105 });
    } else if (preset === 'fullwidth') {
      updateSettings({ sideMargin: is80 ? 1.0 : 0.5, leftShift: 0, verticalOffset: 0.5, logoSize: is80 ? 135 : 115 });
    } else if (preset === 'nudgeRight') {
      updateSettings({ leftShift: 2.5, verticalOffset: 0.8 });
    } else if (preset === 'nudgeLeft') {
      updateSettings({ leftShift: -2.5, verticalOffset: 0.8 });
    }
  };

  const scale = (settings.fontScale || 108) / 100;
  const baseFontSize = 11.5 * scale;
  const titleFontSize = 15.5 * scale;
  const totalFontSize = 14.5 * scale;
  const sideMargin = typeof settings.sideMargin === 'number' ? settings.sideMargin : 2.5;
  const leftShift = typeof settings.leftShift === 'number' ? settings.leftShift : 0;
  const padLeft = Math.max(0, sideMargin + leftShift);
  const padRight = Math.max(0, sideMargin - leftShift);
  const vOffset = Math.max(0, settings.verticalOffset ?? 0.8);
  const logoSize = Math.max(40, settings.logoSize || 120);

  const handlePrint = () => {
    let iframe = document.getElementById('invoice-isolated-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'invoice-isolated-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = `${settings.paperWidth}mm`;
      iframe.style.height = '100px';
      iframe.style.zIndex = '-99999';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const itemsHtml = data.items.map(item => {
      const barcode = item.barcode || item.sku || item.code;
      const isReturn = item.saleType === 'RETURN';
      return `
        <div class="item-row" style="margin-bottom: ${(settings.itemSpacing || 1.2)}mm;">
          <div class="item-name">
            ${item.name}
            ${isReturn ? `<span style="font-size: ${(baseFontSize * 0.82).toFixed(1)}px; border: 1px solid #000; padding: 0 2px; border-radius: 2px; margin-left: 1mm; font-weight: 900;">[RETURN]</span>` : ''}
          </div>
          ${(settings.showBarcode ?? settings.showProductCode) && barcode ? `
            <div class="item-code">
              ${barcode}
            </div>
          ` : ''}
          <div class="item-details">
            <span>${item.quantity} × ${isReturn ? '-' : ''}৳${item.unitPrice.toFixed(0)}</span>
            <span class="item-price">${isReturn ? '-' : ''}৳${Math.abs(item.totalPrice).toFixed(0)}</span>
          </div>
        </div>
      `;
    }).join('');

    const paymentsHtml = (data.paymentRows || [])
      .filter(r => r.amount > 0)
      .map(r => `
        <div class="math-row" style="font-size: ${(baseFontSize * 0.95).toFixed(1)}px;">
          <span>Paid (${r.method}):</span>
          <span>৳${r.amount.toFixed(0)}</span>
        </div>
      `).join('');

    const activeLogoSrc = monochromeLogo || logoImg;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title> </title>
          <style>
            @page {
              size: ${settings.paperWidth}mm auto;
              margin: 0mm !important;
            }
            * {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              width: 100% !important;
              max-width: ${settings.paperWidth}mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
              color: #000000 !important;
              text-align: left !important;
              font-size: ${baseFontSize.toFixed(1)}px !important;
              font-weight: 700 !important;
              line-height: 1.25 !important;
              -webkit-font-smoothing: antialiased !important;
              text-rendering: optimizeLegibility !important;
              overflow: visible !important;
            }
            .receipt-wrapper {
              width: 100% !important;
              max-width: ${settings.paperWidth}mm !important;
              margin: 0 auto !important;
              padding-top: ${vOffset.toFixed(1)}mm !important;
              padding-bottom: 3mm !important;
              box-sizing: border-box !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              padding-left: ${padLeft.toFixed(1)}mm !important;
              padding-right: ${padRight.toFixed(1)}mm !important;
              box-sizing: border-box !important;
              page-break-after: avoid !important;
              page-break-before: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              break-after: avoid !important;
            }
            .store-header {
              text-align: center !important;
              border-bottom: 2px dashed #000000 !important;
              padding-bottom: 0.8mm !important;
              margin-bottom: 0.8mm !important;
            }
            .store-logo {
              width: ${logoSize}px !important;
              max-width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
              display: block !important;
              margin: 0 auto 0.4mm auto !important;
              image-rendering: -webkit-optimize-contrast !important;
              image-rendering: crisp-edges !important;
            }
            .store-title {
              font-size: ${titleFontSize.toFixed(1)}px !important;
              font-weight: 900 !important;
              text-transform: uppercase !important;
              letter-spacing: 0.5px !important;
              margin: 0 !important;
              line-height: 1.1 !important;
              color: #000000 !important;
            }
            .store-sub {
              font-size: ${(baseFontSize * 0.85).toFixed(1)}px !important;
              font-weight: 800 !important;
              text-transform: uppercase !important;
              margin: 0.4mm 0 0 0 !important;
              color: #000000 !important;
            }
            .store-contact {
              font-size: ${(baseFontSize * 0.82).toFixed(1)}px !important;
              font-weight: 700 !important;
              margin: 0.3mm 0 0 0 !important;
              color: #000000 !important;
            }
            .meta-section {
              font-size: ${(baseFontSize * 0.9).toFixed(1)}px !important;
              font-weight: 700 !important;
              border-bottom: 2px dashed #000000 !important;
              padding-bottom: 1.2mm !important;
              margin-bottom: 1.5mm !important;
              color: #000000 !important;
            }
            .meta-row {
              display: flex !important;
              justify-content: space-between !important;
              margin-bottom: 0.4mm !important;
            }
            .items-section {
              border-bottom: 2px dashed #000000 !important;
              padding-bottom: 1.8mm !important;
              margin-bottom: 1.8mm !important;
            }
            .item-row {
              display: flex !important;
              flex-direction: column !important;
              width: 100% !important;
              box-sizing: border-box !important;
              word-break: break-word !important;
              overflow-wrap: break-word !important;
            }
            .item-name {
              font-weight: 900 !important;
              word-break: break-word !important;
              overflow-wrap: break-word !important;
              line-height: 1.25 !important;
              color: #000000 !important;
            }
            .item-code {
              font-size: ${(baseFontSize * 0.85).toFixed(1)}px !important;
              font-weight: 800 !important;
              color: #000000 !important;
              letter-spacing: 0.3px !important;
              line-height: 1.2 !important;
              margin-top: 0.3mm !important;
            }
            .item-details {
              display: flex !important;
              justify-content: space-between !important;
              align-items: baseline !important;
              width: 100% !important;
              box-sizing: border-box !important;
              font-weight: 800 !important;
              font-size: ${(baseFontSize * 0.95).toFixed(1)}px !important;
              color: #000000 !important;
              margin-top: 0.8mm !important;
            }
            .item-price {
              font-weight: 900 !important;
              font-size: ${(baseFontSize * 1.0).toFixed(1)}px !important;
              color: #000000 !important;
              flex-shrink: 0 !important;
              text-align: right !important;
              padding-left: 2mm !important;
            }
            .math-section {
              display: flex !important;
              flex-direction: column !important;
              gap: 0.5mm !important;
            }
            .math-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              font-weight: 800 !important;
              color: #000000 !important;
            }
            .total-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              font-size: ${totalFontSize.toFixed(1)}px !important;
              font-weight: 900 !important;
              border-top: 2px solid #000000 !important;
              padding-top: 1mm !important;
              margin-top: 0.5mm !important;
              color: #000000 !important;
            }
            .footer-note {
              text-align: center !important;
              font-size: ${(baseFontSize * 0.85).toFixed(1)}px !important;
              font-weight: 900 !important;
              margin-top: 2mm !important;
              border-top: 2px dashed #000000 !important;
              padding-top: 1.2mm !important;
              color: #000000 !important;
            }
          </style>
        </head>
        <body>
          <div class="receipt-wrapper">
            <div class="receipt-container">
              ${settings.showStoreHeader ? `
                <div class="store-header">
                  ${settings.showLogo ? `<img src="${activeLogoSrc}" class="store-logo" alt="Logo" />` : `
                    <div class="store-title">${settings.storeName || 'Blue Dream'}</div>
                    ${settings.storeSubtitle ? `<div class="store-sub">${settings.storeSubtitle}</div>` : ''}
                  `}
                  ${settings.storeAddress ? `<div class="store-contact">${settings.storeAddress}</div>` : ''}
                  ${settings.storePhone ? `<div class="store-contact">Phone: ${settings.storePhone}</div>` : ''}
                </div>
              ` : ''}

              ${settings.showInvoiceDetails ? `
                <div class="meta-section">
                  <div class="meta-row">
                    <span>INV: <strong>${data.invoiceCode || data.invoiceId.toUpperCase().substring(0, 8)}</strong></span>
                    <span>${formatDateDDMMYYYY(data.saleDate || new Date())}</span>
                  </div>
                  ${settings.showCustomerPhone && (data.customerPhone || data.customerName) ? `
                    <div class="meta-row">
                      <span>Customer:</span>
                      <span><strong>${[data.customerName, data.customerPhone].filter(Boolean).join(' - ')}</strong></span>
                    </div>
                  ` : ''}
                  ${data.guarantorName || data.guarantorPhone ? `
                    <div class="meta-row">
                      <span>Guarantor:</span>
                      <span><strong>${[data.guarantorName, data.guarantorPhone].filter(Boolean).join(' - ')}</strong></span>
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              <!-- Items -->
              <div class="items-section">
                ${itemsHtml}
              </div>

              <!-- Summary / Math -->
              <div class="math-section">
                ${data.discountAmount > 0 ? `
                  <div class="math-row">
                    <span>Subtotal:</span>
                    <span>৳${data.totalAmount.toFixed(0)}</span>
                  </div>
                  <div class="math-row">
                    <span>Discount:</span>
                    <span>-৳${data.discountAmount.toFixed(0)}</span>
                  </div>
                ` : ''}

                <div class="total-row">
                  <span>${data.payableAmount < 0 ? 'REFUND / CASH RETURN:' : 'TOTAL:'}</span>
                  <span>${data.payableAmount < 0 ? '-৳' + Math.abs(data.payableAmount).toFixed(0) : '৳' + data.payableAmount.toFixed(0)}</span>
                </div>

                ${settings.showPaymentBreakdown ? `
                  ${paymentsHtml || `
                    <div class="math-row">
                      <span>Paid (${data.paymentMethod}):</span>
                      <span>৳${data.receivedAmount.toFixed(0)}</span>
                    </div>
                  `}
                  ${data.dueAmount > 0 ? `
                    <div class="math-row" style="font-weight: 900;">
                      <span>DUE:</span>
                      <span>৳${data.dueAmount.toFixed(0)}</span>
                    </div>
                  ` : ''}
                  ${data.changeAmount > 0 ? `
                    <div class="math-row" style="font-weight: 800;">
                      <span>Change:</span>
                      <span>৳${data.changeAmount.toFixed(0)}</span>
                    </div>
                  ` : ''}
                ` : ''}
              </div>

              <div class="footer-note">
                ${settings.footerText || 'Thank you for your shopping!'}
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 250);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '12px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '820px',
        maxHeight: '96vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        backgroundColor: '#ffffff',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eef2f6', paddingBottom: '10px', marginBottom: '8px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Sales Invoice Print ({settings.paperWidth || 80}mm POS Thermal)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              Precise Paper Centering &amp; Full Width Auto-Fitting
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Paper Size Switcher */}
            <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '5px', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => switchPaperWidth(80)}
                style={{
                  padding: '3px 9px',
                  fontSize: '11px',
                  fontWeight: 800,
                  borderRadius: '3px',
                  border: 'none',
                  backgroundColor: (settings.paperWidth || 80) === 80 ? '#2563eb' : 'transparent',
                  color: (settings.paperWidth || 80) === 80 ? '#ffffff' : '#475569',
                  cursor: 'pointer'
                }}
              >
                🖨️ 80mm (Standard)
              </button>
              <button
                type="button"
                onClick={() => switchPaperWidth(58)}
                style={{
                  padding: '3px 9px',
                  fontSize: '11px',
                  fontWeight: 800,
                  borderRadius: '3px',
                  border: 'none',
                  backgroundColor: settings.paperWidth === 58 ? '#2563eb' : 'transparent',
                  color: settings.paperWidth === 58 ? '#ffffff' : '#475569',
                  cursor: 'pointer'
                }}
              >
                58mm (Mini)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTuning(!showTuning)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                backgroundColor: showTuning ? '#e0e7ff' : '#ffffff',
                color: showTuning ? '#3730a3' : '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Sliders size={12} /> {showTuning ? 'Hide Controls' : 'Print Tuning'}
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick Tip Alert */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '5px',
          padding: '6px 10px',
          marginBottom: '8px',
          fontSize: '11px',
          color: '#1e40af'
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>
            <strong>Printing Tip:</strong> In the browser print dialog (Ctrl+P), select <strong>Paper Size: {(settings.paperWidth || 80) === 80 ? '80mm (or 80 x 297mm / 3 inch roll)' : '58mm roll'}</strong> and <strong>Margins: None (0)</strong>.
          </span>
        </div>

        {/* Tuning Toolbar */}
        {showTuning && (
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {/* Tuner Navigation Tabs & Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('align')}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: activeTab === 'align' ? '#2563eb' : '#cbd5e1',
                    backgroundColor: activeTab === 'align' ? '#eff6ff' : '#ffffff',
                    color: activeTab === 'align' ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  <AlignCenter size={11} style={{ display: 'inline', marginRight: '3px' }} /> Paper Centering (Left/Right)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('logo')}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: activeTab === 'logo' ? '#2563eb' : '#cbd5e1',
                    backgroundColor: activeTab === 'logo' ? '#eff6ff' : '#ffffff',
                    color: activeTab === 'logo' ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  <Eye size={11} style={{ display: 'inline', marginRight: '3px' }} /> Logo Size &amp; Clarity
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: activeTab === 'text' ? '#2563eb' : '#cbd5e1',
                    backgroundColor: activeTab === 'text' ? '#eff6ff' : '#ffffff',
                    color: activeTab === 'text' ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  <Store size={11} style={{ display: 'inline', marginRight: '3px' }} /> Showroom Info
                </button>
              </div>

              {/* 1-Click Presets */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('centered')}
                  title="True Center with 1mm edge padding on both sides"
                  style={{ padding: '2px 7px', fontSize: '10px', fontWeight: 700, borderRadius: '3px', border: '1px solid #bfdbfe', backgroundColor: leftShift === 0 && sideMargin === 1.0 ? '#2563eb' : '#eff6ff', color: leftShift === 0 && sideMargin === 1.0 ? '#ffffff' : '#1d4ed8', cursor: 'pointer' }}
                >
                  🎯 True Center (1mm)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('fullwidth')}
                  title="Edge to edge width (0.5mm margins)"
                  style={{ padding: '2px 7px', fontSize: '10px', fontWeight: 700, borderRadius: '3px', border: '1px solid #cbd5e1', backgroundColor: sideMargin === 0.5 ? '#2563eb' : '#ffffff', color: sideMargin === 0.5 ? '#ffffff' : '#475569', cursor: 'pointer' }}
                >
                  ↔ Edge-to-Edge (0.5mm)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('nudgeRight')}
                  title="Nudge 2mm right if printer head is biased left"
                  style={{ padding: '2px 6px', fontSize: '10px', fontWeight: 700, borderRadius: '3px', border: '1px solid #cbd5e1', backgroundColor: leftShift === 2.0 ? '#2563eb' : '#ffffff', color: leftShift === 2.0 ? '#ffffff' : '#475569', cursor: 'pointer' }}
                >
                  ▶ Shift Right (+2mm)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('nudgeLeft')}
                  title="Nudge 2mm left if printer head is biased right"
                  style={{ padding: '2px 6px', fontSize: '10px', fontWeight: 700, borderRadius: '3px', border: '1px solid #cbd5e1', backgroundColor: leftShift === -2.0 ? '#2563eb' : '#ffffff', color: leftShift === -2.0 ? '#ffffff' : '#475569', cursor: 'pointer' }}
                >
                  ◀ Shift Left (-2mm)
                </button>
                <button
                  type="button"
                  onClick={resetSettings}
                  style={{ padding: '2px 6px', fontSize: '10px', fontWeight: 600, borderRadius: '3px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#64748b', cursor: 'pointer' }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* TAB 1: Centering & Alignment */}
            {activeTab === 'align' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                  {/* 1. Equal Side Margins (Padding) */}
                  <div style={{ background: '#f1f5f9', padding: '6px 8px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#1e293b', marginBottom: '3px' }}>
                      <span>Side Margins (Equal L/R):</span>
                      <span style={{ color: '#2563eb', fontWeight: 900 }}>{sideMargin.toFixed(1)} mm</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button type="button" onClick={() => updateSettings({ sideMargin: Math.max(0, parseFloat((sideMargin - 0.5).toFixed(1))) })} style={{ width: '26px', height: '24px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>-</button>
                      <input
                        type="range"
                        min="0"
                        max="6"
                        step="0.5"
                        value={sideMargin}
                        onChange={e => updateSettings({ sideMargin: parseFloat(e.target.value) })}
                        style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                      />
                      <button type="button" onClick={() => updateSettings({ sideMargin: Math.min(8, parseFloat((sideMargin + 0.5).toFixed(1))) })} style={{ width: '26px', height: '24px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>+</button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginTop: '3px' }}>
                      <span onClick={() => updateSettings({ sideMargin: 0.5 })} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Full (0.5mm)</span>
                      <span onClick={() => updateSettings({ sideMargin: 1.0 })} style={{ cursor: 'pointer', fontWeight: 800, color: '#2563eb', textDecoration: 'underline' }}>Standard (1mm)</span>
                      <span onClick={() => updateSettings({ sideMargin: 2.0 })} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Safe (2mm)</span>
                    </div>
                  </div>

                  {/* 2. Left / Right Balance Nudge */}
                  <div style={{ background: '#f1f5f9', padding: '6px 8px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#1e293b', marginBottom: '3px' }}>
                      <span>Balance Nudge (L/R):</span>
                      <span style={{ color: leftShift === 0 ? '#059669' : '#2563eb', fontWeight: 900 }}>
                        {leftShift === 0 ? 'Centered (0)' : leftShift > 0 ? `+${leftShift}mm Right` : `${leftShift}mm Left`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button type="button" onClick={() => updateSettings({ leftShift: Math.max(-6, parseFloat((leftShift - 0.5).toFixed(1))) })} style={{ width: '28px', height: '24px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }} title="Shift Left 0.5mm">◀</button>
                      <input
                        type="range"
                        min="-6"
                        max="6"
                        step="0.5"
                        value={leftShift}
                        onChange={e => updateSettings({ leftShift: parseFloat(e.target.value) })}
                        style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                      />
                      <button type="button" onClick={() => updateSettings({ leftShift: Math.min(6, parseFloat((leftShift + 0.5).toFixed(1))) })} style={{ width: '28px', height: '24px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }} title="Shift Right 0.5mm">▶</button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginTop: '3px' }}>
                      <span onClick={() => updateSettings({ leftShift: -2 })} style={{ cursor: 'pointer', textDecoration: 'underline' }}>-2mm</span>
                      <span onClick={() => updateSettings({ leftShift: 0 })} style={{ cursor: 'pointer', fontWeight: 800, color: '#059669', textDecoration: 'underline' }}>Center (0)</span>
                      <span onClick={() => updateSettings({ leftShift: 2 })} style={{ cursor: 'pointer', textDecoration: 'underline' }}>+2mm</span>
                    </div>
                  </div>

                  {/* 3. Top Spacing (Vertical Offset) */}
                  <div style={{ background: '#f1f5f9', padding: '6px 8px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#1e293b', marginBottom: '3px' }}>
                      <span>Top Feed (Vertical):</span>
                      <span style={{ color: '#2563eb', fontWeight: 900 }}>{vOffset} mm</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button type="button" onClick={() => updateSettings({ verticalOffset: Math.max(0, parseFloat((vOffset - 0.5).toFixed(1))) })} style={{ width: '26px', height: '24px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>▲</button>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={vOffset}
                        onChange={e => updateSettings({ verticalOffset: parseFloat(e.target.value) })}
                        style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                      />
                      <button type="button" onClick={() => updateSettings({ verticalOffset: Math.min(25, parseFloat((vOffset + 0.5).toFixed(1))) })} style={{ width: '26px', height: '24px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>▼</button>
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px' }}>Space before top of receipt</div>
                  </div>

                  {/* 4. Font Size Scale */}
                  <div style={{ background: '#f1f5f9', padding: '6px 8px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#1e293b', marginBottom: '3px' }}>
                      <span>Font Scale:</span>
                      <span style={{ color: '#2563eb', fontWeight: 900 }}>{settings.fontScale}%</span>
                    </div>
                    <input
                      type="range"
                      min="80"
                      max="140"
                      step="5"
                      value={settings.fontScale}
                      onChange={e => updateSettings({ fontScale: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer', marginTop: '4px' }}
                    />
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px' }}>Adjusts all font sizes proportionally</div>
                  </div>
                </div>

                {/* Feature Toggles */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', borderTop: '1px dashed #cbd5e1', paddingTop: '6px', fontSize: '11px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={settings.showLogo}
                      onChange={e => updateSettings({ showLogo: e.target.checked })}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span>Brand Logo</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={settings.showStoreHeader}
                      onChange={e => updateSettings({ showStoreHeader: e.target.checked })}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span>Showroom Info</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={settings.showInvoiceDetails}
                      onChange={e => updateSettings({ showInvoiceDetails: e.target.checked })}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span>Invoice # &amp; Date</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={settings.showCustomerPhone}
                      onChange={e => updateSettings({ showCustomerPhone: e.target.checked })}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span>Customer Phone</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={settings.showBarcode ?? settings.showProductCode ?? true}
                      onChange={e => updateSettings({ showBarcode: e.target.checked, showProductCode: e.target.checked })}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span>Barcode</span>
                  </label>
                </div>
              </>
            )}

            {/* TAB 2: Logo Size & Clarity */}
            {activeTab === 'logo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {/* Logo Width */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '2px' }}>
                      <span>Logo Display Width:</span>
                      <span style={{ color: '#2563eb', fontWeight: 900 }}>{logoSize} px</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button type="button" onClick={() => updateSettings({ logoSize: Math.max(50, logoSize - 10) })} style={{ width: '28px', height: '24px', fontSize: '12px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>-</button>
                      <input
                        type="range"
                        min="60"
                        max="220"
                        step="5"
                        value={logoSize}
                        onChange={e => updateSettings({ logoSize: parseInt(e.target.value) })}
                        style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                      />
                      <button type="button" onClick={() => updateSettings({ logoSize: Math.min(220, logoSize + 10) })} style={{ width: '28px', height: '24px', fontSize: '12px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>+</button>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      <button type="button" onClick={() => updateSettings({ logoSize: 90 })} style={{ flex: 1, padding: '2px', fontSize: '9.5px', border: '1px solid #cbd5e1', borderRadius: '3px', background: logoSize === 90 ? '#eff6ff' : '#fff', color: logoSize === 90 ? '#1d4ed8' : '#475569' }}>Small (90px)</button>
                      <button type="button" onClick={() => updateSettings({ logoSize: 135 })} style={{ flex: 1, padding: '2px', fontSize: '9.5px', border: '1px solid #cbd5e1', borderRadius: '3px', background: logoSize === 135 ? '#eff6ff' : '#fff', fontWeight: 700, color: logoSize === 135 ? '#1d4ed8' : '#475569' }}>Medium (135px)</button>
                      <button type="button" onClick={() => updateSettings({ logoSize: 170 })} style={{ flex: 1, padding: '2px', fontSize: '9.5px', border: '1px solid #cbd5e1', borderRadius: '3px', background: logoSize === 170 ? '#eff6ff' : '#fff', color: logoSize === 170 ? '#1d4ed8' : '#475569' }}>Large (170px)</button>
                    </div>
                  </div>

                  {/* Thermal Contrast Threshold */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '2px' }}>
                      <span>Thermal Black/White Cleanliness:</span>
                      <span style={{ color: '#2563eb', fontWeight: 900 }}>{settings.logoThreshold || 210}</span>
                    </div>
                    <input
                      type="range"
                      min="140"
                      max="245"
                      step="5"
                      value={settings.logoThreshold || 210}
                      onChange={e => updateSettings({ logoThreshold: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                      Filters out cream background &amp; keeps text deep pure black
                    </div>
                  </div>
                </div>

                {/* Logo Live Sample */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <img
                    src={monochromeLogo || logoImg}
                    alt="Logo preview"
                    style={{
                      width: `${logoSize}px`,
                      maxWidth: '100%',
                      height: 'auto',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: Showroom Information */}
            {activeTab === 'text' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                    Showroom / Store Name:
                  </label>
                  <input
                    type="text"
                    value={settings.storeName}
                    onChange={e => updateSettings({ storeName: e.target.value })}
                    placeholder="e.g. Blue Dream"
                    style={{ width: '100%', padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                    Subtitle / Tagline:
                  </label>
                  <input
                    type="text"
                    value={settings.storeSubtitle}
                    onChange={e => updateSettings({ storeSubtitle: e.target.value })}
                    placeholder="e.g. "
                    style={{ width: '100%', padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                    Showroom Address:
                  </label>
                  <input
                    type="text"
                    value={settings.storeAddress}
                    onChange={e => updateSettings({ storeAddress: e.target.value })}
                    placeholder="e.g. Laxmi Square - 2nd Floor, Jaldi, Banskhali"
                    style={{ width: '100%', padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                    Hotline / Phone:
                  </label>
                  <input
                    type="text"
                    value={settings.storePhone}
                    onChange={e => updateSettings({ storePhone: e.target.value })}
                    placeholder="e.g. 01700-000000"
                    style={{ width: '100%', padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                    Footer Greeting:
                  </label>
                  <input
                    type="text"
                    value={settings.footerText}
                    onChange={e => updateSettings({ footerText: e.target.value })}
                    placeholder="Thank you for your shopping!"
                    style={{ width: '100%', padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Preview of POS Thermal Receipt */}
        <div style={{
          flex: 1,
          maxHeight: '430px',
          overflowY: 'auto',
          backgroundColor: '#f1f5f9',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start'
        }}>
          {/* Label indicating physical roll boundary */}
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
            {settings.paperWidth || 80}mm Physical Paper Roll (Left Margin: <strong>{padLeft.toFixed(1)}mm</strong> | Right Margin: <strong>{padRight.toFixed(1)}mm</strong>)
          </div>

          {/* Outer roll wrapper — 320px for 80mm roll, 232px for 58mm roll (4px/mm) */}
          <div style={{
            width: (settings.paperWidth || 80) === 80 ? '320px' : '232px',
            flexShrink: 0,
            backgroundColor: '#e2e8f0',
            border: '2px solid #94a3b8',
            borderRadius: '4px',
            paddingTop: `${vOffset * 4}px`,
            paddingBottom: '16px',
            paddingLeft: `${padLeft * 4}px`,
            paddingRight: `${padRight * 4}px`,
            boxSizing: 'border-box',
            transition: 'width 0.2s ease'
          }}>
            {/* Simulated content area */}
            <div style={{
              width: '100%',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
              borderRadius: '2px',
              paddingTop: '6px',
              paddingBottom: '12px',
              paddingLeft: '4px',
              paddingRight: '4px',
              fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
              fontSize: `${baseFontSize}px`,
              fontWeight: 700,
              lineHeight: 1.25,
              color: '#000000',
              boxSizing: 'border-box'
            }}>
              {/* Store Header */}
              {settings.showStoreHeader && (
                <div style={{ textAlign: 'center', borderBottom: '2px dashed #000000', paddingBottom: '6px', marginBottom: '6px' }}>
                  {settings.showLogo ? (
                    <img
                      src={monochromeLogo || logoImg}
                      alt="Logo"
                      style={{
                        width: `${Math.min(220, logoSize * 0.9)}px`,
                        maxWidth: '100%',
                        height: 'auto',
                        objectFit: 'contain',
                        display: 'block',
                        margin: '0 auto 4px auto'
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: `${titleFontSize}px`, fontWeight: 900, textTransform: 'uppercase', color: '#000000' }}>{settings.storeName || 'Blue Dream'}</div>
                      {settings.storeSubtitle && (
                        <div style={{ fontSize: `${baseFontSize * 0.85}px`, fontWeight: 800, textTransform: 'uppercase', color: '#000000' }}>{settings.storeSubtitle}</div>
                      )}
                    </>
                  )}
                  {settings.storeAddress && (
                    <div style={{ fontSize: `${baseFontSize * 0.82}px`, fontWeight: 700, color: '#000000' }}>{settings.storeAddress}</div>
                  )}
                  {settings.storePhone && (
                    <div style={{ fontSize: `${baseFontSize * 0.82}px`, fontWeight: 700, color: '#000000' }}>Phone: {settings.storePhone}</div>
                  )}
                </div>
              )}

              {/* Invoice Details */}
              {settings.showInvoiceDetails && (
                <div style={{ fontSize: `${baseFontSize * 0.9}px`, fontWeight: 700, borderBottom: '2px dashed #000000', paddingBottom: '6px', marginBottom: '6px', color: '#000000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>INV: <strong>{data.invoiceCode || data.invoiceId.toUpperCase().substring(0, 8)}</strong></span>
                    <span>{formatDateDDMMYYYY(data.saleDate || new Date())}</span>
                  </div>
                  {settings.showCustomerPhone && (data.customerPhone || data.customerName) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span>Customer:</span>
                      <span><strong>{[data.customerName, data.customerPhone].filter(Boolean).join(' - ')}</strong></span>
                    </div>
                  )}
                  {(data.guarantorName || data.guarantorPhone) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span>Guarantor:</span>
                      <span><strong>{[data.guarantorName, data.guarantorPhone].filter(Boolean).join(' - ')}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {/* Items List */}
              <div style={{ borderBottom: '2px dashed #000000', paddingBottom: '8px', marginBottom: '8px' }}>
                {data.items.map((item, idx) => {
                  const barcode = item.barcode || item.sku || item.code;
                  const isReturn = item.saleType === 'RETURN';
                  return (
                    <div key={idx} style={{ marginBottom: `${(settings.itemSpacing || 1.2) * 4.5}px` }}>
                      <div style={{ fontWeight: 900, wordBreak: 'break-word', overflowWrap: 'break-word', color: '#000000', lineHeight: 1.25 }}>
                        {item.name}
                        {isReturn && (
                          <span style={{ fontSize: `${baseFontSize * 0.82}px`, border: '1px solid #000', padding: '0 3px', borderRadius: '2px', marginLeft: '4px', fontWeight: 900 }}>
                            [RETURN]
                          </span>
                        )}
                      </div>
                      {(settings.showBarcode ?? settings.showProductCode) && barcode && (
                        <div style={{ fontSize: `${baseFontSize * 0.85}px`, color: '#000000', fontWeight: 800, letterSpacing: '0.3px', marginTop: '1px' }}>
                          {barcode}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 800, fontSize: `${baseFontSize * 0.95}px`, color: '#000000', marginTop: '3px' }}>
                        <span>{item.quantity} × {isReturn ? '-' : ''}৳{item.unitPrice.toFixed(0)}</span>
                        <span style={{ fontWeight: 900, fontSize: `${baseFontSize}px`, flexShrink: 0, paddingLeft: '6px' }}>{isReturn ? '-' : ''}৳{Math.abs(item.totalPrice).toFixed(0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Math & Total */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {data.discountAmount > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#000000' }}>
                      <span>Subtotal:</span>
                      <span>৳{data.totalAmount.toFixed(0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#000000' }}>
                      <span>Discount:</span>
                      <span>-৳{data.discountAmount.toFixed(0)}</span>
                    </div>
                  </>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: `${totalFontSize}px`,
                  fontWeight: 900,
                  borderTop: '2px solid #000000',
                  paddingTop: '4px',
                  marginTop: '2px',
                  color: '#000000'
                }}>
                  <span>{data.payableAmount < 0 ? 'REFUND / CASH RETURN:' : 'TOTAL:'}</span>
                  <span>{data.payableAmount < 0 ? `-৳${Math.abs(data.payableAmount).toFixed(0)}` : `৳${data.payableAmount.toFixed(0)}`}</span>
                </div>

                {settings.showPaymentBreakdown && (
                  <>
                    {(data.paymentRows || []).filter(r => r.amount > 0).map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: `${baseFontSize * 0.95}px`, fontWeight: 700, color: '#000000' }}>
                        <span>Paid ({r.method}):</span>
                        <span>৳{r.amount.toFixed(0)}</span>
                      </div>
                    ))}
                    {(!data.paymentRows || data.paymentRows.length === 0) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: `${baseFontSize * 0.95}px`, fontWeight: 700, color: '#000000' }}>
                        <span>Paid ({data.paymentMethod}):</span>
                        <span>৳{data.receivedAmount.toFixed(0)}</span>
                      </div>
                    )}
                    {data.dueAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: '#000000' }}>
                        <span>DUE:</span>
                        <span>৳{data.dueAmount.toFixed(0)}</span>
                      </div>
                    )}
                    {data.changeAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000000', fontWeight: 800 }}>
                        <span>Change:</span>
                        <span>৳{data.changeAmount.toFixed(0)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ textAlign: 'center', fontSize: `${baseFontSize * 0.85}px`, fontWeight: 900, color: '#000000', marginTop: '10px', borderTop: '2px dashed #000000', paddingTop: '5px' }}>
                {settings.footerText || 'Thank you for your shopping!'}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #eef2f6', paddingTop: '10px', marginTop: '10px' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Close
          </button>
          {onNewSale && (
            <button className="btn btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={onNewSale}>
              <RefreshCw size={14} /> New Sale
            </button>
          )}
          <button className="btn btn-primary" style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handlePrint}>
            <Printer size={15} /> Print Receipt (58mm)
          </button>
        </div>
      </div>
    </div>
  );
};
