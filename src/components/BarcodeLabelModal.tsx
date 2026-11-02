import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';
import type { Product, ProductVariant } from '../store';

interface BarcodeLabelModalProps {
  variant: ProductVariant;
  productName: string;
  product?: Product;
  onClose: () => void;
}

// Calibrated printer configuration for 35mm x 45mm vertical thermal stickers
const BASE_CONFIG = {
  printWidth: '35mm',
  printHeight: '45mm',
  cardWidth: '175px',
  cardHeight: '225px',
  storeFontSize: 11,
  subFontSize: 6.8,
  prodFontSize: 9.5,
  skuFontSize: 8.5,
  specFontSize: 8.5,
  priceFontSize: 13,
  offerFontSize: 14,
  barcodeWidth: 1.1,
  barcodeFontSize: 9
};

export interface BarcodeTuningSettings {
  verticalOffset: number; // in mm, e.g. -2
  horizontalOffset: number; // in mm, e.g. 0 (positive = right, negative = left)
  elementGap: number; // in mm, e.g. 0.8
  barcodeHeight: number; // in px, e.g. 24
  bottomSafeMargin: number; // in mm, e.g. 4
  fontScale: number; // e.g. 100 (%)
  layoutMode: 'center' | 'top' | 'space-between';
}

const DEFAULT_SETTINGS: BarcodeTuningSettings = {
  verticalOffset: -2, // Lift slightly by default so price is never near the bottom cut-off
  horizontalOffset: 0,// 0mm default horizontal center
  elementGap: 0.8,    // Tightly grouped text lines with no awkward gaps
  barcodeHeight: 24,  // Clean, scannable, compact barcode
  bottomSafeMargin: 4,// 4mm safe margin from the bottom tear edge
  fontScale: 100,
  layoutMode: 'center'
};

const getSavedSettings = (): BarcodeTuningSettings => {
  try {
    const raw = localStorage.getItem('pos_barcode_tuning_settings');
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to parse saved settings', e);
  }
  return DEFAULT_SETTINGS;
};

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({ variant, productName, onClose }) => {
  const baseEffectivePrice = variant.selling_price;

  const [copies, setCopies] = useState<number>(1);
  const [storeName, setStoreName] = useState<string>('Blue Dream');
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [hasDiscount, setHasDiscount] = useState<boolean>(false);
  const [discountPrice, setDiscountPrice] = useState<number>(baseEffectivePrice);
  const [promoBadge, setPromoBadge] = useState<string>('SPECIAL OFFER');

  useEffect(() => {
    setDiscountPrice(baseEffectivePrice);
  }, [baseEffectivePrice]);

  // Interactive tuning controls state
  const [settings, setSettings] = useState<BarcodeTuningSettings>(getSavedSettings);
  const [showTuningPanel, setShowTuningPanel] = useState<boolean>(true);

  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);

  const updateSettings = (partial: Partial<BarcodeTuningSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem('pos_barcode_tuning_settings', JSON.stringify(next));
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem('pos_barcode_tuning_settings', JSON.stringify(DEFAULT_SETTINGS));
  };

  // Generate Barcode SVG
  useEffect(() => {
    barcodeRefs.current.forEach((svgEl) => {
      const cleanBc = (variant.barcode || '').trim().replace(/[^0-9a-zA-Z]/g, '');
      if (svgEl && cleanBc) {
        try {
          JsBarcode(svgEl, cleanBc, {
            format: 'CODE128',
            width: BASE_CONFIG.barcodeWidth,
            height: settings.barcodeHeight,
            displayValue: true,
            fontSize: BASE_CONFIG.barcodeFontSize,
            font: 'sans-serif',
            fontOptions: 'bold',
            margin: 0,
            textMargin: 2
          });
        } catch (e) {
          console.error('Failed to generate barcode SVG', e);
        }
      }
    });
  }, [variant.barcode, copies, hasDiscount, settings.barcodeHeight]);

  const scale = settings.fontScale / 100;

  const handlePrint = () => {
    let iframe = document.getElementById('barcode-isolated-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'barcode-isolated-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100vw';
      iframe.style.height = '100vh';
      iframe.style.zIndex = '-99999';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const cleanBc = (variant.barcode || '').trim().replace(/[^0-9a-zA-Z]/g, '');
    let svgHtml = '';
    if (cleanBc) {
      try {
        const itemSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(itemSvg, cleanBc, {
          format: 'CODE128',
          width: BASE_CONFIG.barcodeWidth,
          height: settings.barcodeHeight,
          displayValue: true,
          fontSize: BASE_CONFIG.barcodeFontSize,
          font: 'sans-serif',
          fontOptions: 'bold',
          margin: 0,
          textMargin: 2
        });
        svgHtml = itemSvg.outerHTML;
      } catch (e) {
        console.error('Failed to generate barcode SVG', e);
      }
    }

    const hOffset = settings.horizontalOffset || 0;
    const vOffset = settings.verticalOffset || 0;

    const stickerItemsHtml = Array.from({ length: copies }).map(() => `
      <div class="print-label">
        <div class="print-container" style="transform: translate(${hOffset}mm, ${vOffset}mm); gap: ${settings.elementGap}mm; padding-bottom: ${settings.bottomSafeMargin}mm; justify-content: ${settings.layoutMode === 'center' ? 'center' : settings.layoutMode === 'top' ? 'flex-start' : 'space-between'};">

          <!-- 1. Store Header -->
          <div class="print-header" style="gap: ${Math.max(0.2, settings.elementGap * 0.4)}mm;">
            <div class="store-title" style="font-size: ${(BASE_CONFIG.storeFontSize * scale).toFixed(1)}px;">${storeName}</div>
            <div class="store-sub" style="font-size: ${(BASE_CONFIG.subFontSize * scale).toFixed(1)}px;"></div>
          </div>

          <!-- 2. Product Name & Specs -->
          <div class="product-info" style="gap: ${Math.max(0.2, settings.elementGap * 0.4)}mm;">
            <div class="product-title" style="font-size: ${(BASE_CONFIG.prodFontSize * scale).toFixed(1)}px;">${productName}</div>
            ${variant.sku ? `<div class="product-sku" style="font-size: ${(BASE_CONFIG.skuFontSize * scale).toFixed(1)}px;">${variant.sku}</div>` : ''}
          </div>

          <!-- 3. Barcode SVG -->
          <div class="barcode-box">
            ${svgHtml}
          </div>

          <!-- 4. Price Tag (Safe distance from bottom) -->
          ${showPrice ? `
            <div class="price-box">
              ${hasDiscount ? `
                <div style="width: 100%; display: flex; justify-content: center; align-items: center; gap: 4px; text-align: center;">
                  <span style="font-size: ${(BASE_CONFIG.specFontSize * scale).toFixed(1)}px; font-weight: 700; color: #555555; text-decoration: line-through;">
                    ৳${baseEffectivePrice.toFixed(0)}
                  </span>
                  <span style="font-size: ${(BASE_CONFIG.offerFontSize * scale).toFixed(1)}px; font-weight: 900; color: #000000;">
                    ৳${discountPrice.toFixed(0)}
                  </span>
                </div>
                ${promoBadge ? `<div style="font-size: ${(BASE_CONFIG.subFontSize * scale).toFixed(1)}px; font-weight: 800; border: 1px solid #000; padding: 0 2px; border-radius: 2px; text-transform: uppercase; line-height: 1; margin-top: 0.2mm;">${promoBadge}</div>` : ''}
              ` : `
                <div class="price-mrp" style="font-size: ${(BASE_CONFIG.priceFontSize * scale).toFixed(1)}px;">
                  MRP: ৳${variant.selling_price.toFixed(2)}
                </div>
              `}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title> </title>
          <style>
            @page {
              size: 35mm 45mm;
              margin: 0mm !important;
            }
            * {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 35mm !important;
              min-height: 45mm !important;
              height: auto !important;
              background: #ffffff !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', 'Plus Jakarta Sans', sans-serif;
              text-align: center !important;
              overflow: visible !important;
            }
            .print-wrapper {
              width: 35mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
            }
            .print-label {
              display: block !important;
              width: 35mm !important;
              height: 44.5mm !important;
              max-width: 35mm !important;
              max-height: 44.5mm !important;
              margin: 0 auto !important;
              padding: 1.5mm 1.5mm !important;
              box-sizing: border-box !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              overflow: hidden !important;
              background: #ffffff !important;
            }
            .print-label:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .print-container {
              width: 100% !important;
              height: 100% !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              box-sizing: border-box !important;
            }
            .print-header {
              width: 100% !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
            }
            .store-title {
              font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif !important;
              font-weight: 900 !important;
              letter-spacing: 0.4px !important;
              color: #000000 !important;
              text-transform: uppercase !important;
              line-height: 1.1 !important;
              margin: 0 !important;
              text-align: center !important;
              width: 100% !important;
              max-width: 32mm !important;
              word-break: break-word !important;
            }
            .store-sub {
              font-weight: 700 !important;
              letter-spacing: 0.2px !important;
              color: #222222 !important;
              text-transform: uppercase !important;
              line-height: 1 !important;
              text-align: center !important;
              width: 100% !important;
            }
            .product-info {
              width: 100% !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
            }
            .product-title {
              font-weight: 800 !important;
              color: #000000 !important;
              line-height: 1.15 !important;
              text-align: center !important;
              word-break: break-word !important;
              overflow: hidden !important;
              display: -webkit-box !important;
              -webkit-line-clamp: 2 !important;
              -webkit-box-orient: vertical !important;
              max-width: 32mm !important;
            }
            .product-sku {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', 'Plus Jakarta Sans', sans-serif !important;
              font-weight: 800 !important;
              color: #111111 !important;
              letter-spacing: 0.3px !important;
              line-height: 1.1 !important;
              text-align: center !important;
              max-width: 32mm !important;
            }
            .product-spec {
              color: #000000 !important;
              font-weight: 800 !important;
              line-height: 1.1 !important;
              text-align: center !important;
              max-width: 32mm !important;
            }
            .barcode-box {
              width: 100% !important;
              max-width: 32mm !important;
              display: flex !important;
              justify-content: center !important;
              align-items: center !important;
              text-align: center !important;
              overflow: hidden !important;
            }
            svg {
              width: 92% !important;
              max-width: 31mm !important;
              height: auto !important;
              display: block !important;
              margin: 0 auto !important;
              text-align: center !important;
            }
            svg text {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', sans-serif !important;
              font-weight: 800 !important;
              fill: #000000 !important;
              letter-spacing: 0.4px !important;
            }
            .price-box {
              width: 100% !important;
              max-width: 32mm !important;
              border-top: 1px dashed #000000 !important;
              padding-top: 0.6mm !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              text-align: center !important;
            }
            .price-mrp {
              font-weight: 900 !important;
              color: #000000 !important;
              letter-spacing: 0.3px !important;
              line-height: 1.1 !important;
              text-align: center !important;
              width: 100% !important;
            }
          </style>
        </head>
        <body>
          <div class="print-wrapper">
            ${stickerItemsHtml}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 350);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '12px'
    }}>
      {/* Modal Container */}
      <div className="card" style={{
        width: '100%',
        maxWidth: '780px',
        maxHeight: '95vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        backgroundColor: '#ffffff',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eef2f6', paddingBottom: '10px', marginBottom: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Print Barcode Sticker
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              {productName} • <strong>35mm × 45mm</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Basic Configuration Toolbar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '10px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ width: '65px' }}>
            <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Copies</label>
            <input
              type="number"
              min="1"
              max="100"
              value={copies}
              onChange={e => setCopies(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className="form-control"
              style={{ height: '30px', fontSize: '12px', padding: '2px 6px', textAlign: 'center', fontWeight: 700 }}
            />
          </div>

          <div style={{ flex: '1 1 120px' }}>
            <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Store Header</label>
            <input
              type="text"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              className="form-control"
              style={{ height: '30px', fontSize: '12px', padding: '2px 8px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '14px' }}>
            <input
              type="checkbox"
              id="show-price-chk"
              checked={showPrice}
              onChange={e => setShowPrice(e.target.checked)}
              style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#1d4ed8' }}
            />
            <label htmlFor="show-price-chk" style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Show Price
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '14px' }}>
            <input
              type="checkbox"
              id="has-discount-chk"
              checked={hasDiscount}
              onChange={e => {
                setHasDiscount(e.target.checked);
                if (e.target.checked && discountPrice === baseEffectivePrice) {
                  setDiscountPrice(Math.round(baseEffectivePrice * 0.9));
                }
              }}
              style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#e11d48' }}
            />
            <label htmlFor="has-discount-chk" style={{ fontSize: '11.5px', fontWeight: 700, color: '#e11d48', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              🔥 Sale Tag
            </label>
          </div>

          {/* Conditional Discount Fields */}
          {hasDiscount && (
            <div style={{ display: 'flex', gap: '8px', width: '100%', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#e11d48', display: 'block', marginBottom: '2px' }}>
                  Sale / Offer Price (৳)
                </label>
                <input
                  type="number"
                  value={discountPrice}
                  onChange={e => setDiscountPrice(Number(e.target.value))}
                  className="form-control"
                  style={{ height: '30px', fontSize: '12px', fontWeight: 700, borderColor: '#fda4af' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                  Promo Badge Label
                </label>
                <input
                  type="text"
                  value={promoBadge}
                  onChange={e => setPromoBadge(e.target.value)}
                  placeholder="e.g. SALE, 20% OFF, SPECIAL"
                  className="form-control"
                  style={{ height: '30px', fontSize: '12px' }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowTuningPanel(!showTuningPanel)}
            style={{
              marginLeft: 'auto',
              marginTop: '10px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              backgroundColor: showTuningPanel ? '#e0e7ff' : '#ffffff',
              color: showTuningPanel ? '#3730a3' : '#475569',
              cursor: 'pointer'
            }}
          >
            ⚙️ {showTuningPanel ? 'Hide Tuning' : 'Adjust Layout'}
          </button>
        </div>


        {/* Live Alignment & Spacing Tuning Controls */}
        {showTuningPanel && (
          <div style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #dbeafe', paddingBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                🎛️ Live Alignment & Position Adjuster
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => updateSettings({ verticalOffset: -3, horizontalOffset: 1, elementGap: 0.6, barcodeHeight: 22, bottomSafeMargin: 5, layoutMode: 'center' })}
                  style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#ffffff', color: '#1d4ed8', cursor: 'pointer' }}
                >
                  ⚡ Safe Compact
                </button>
                <button
                  type="button"
                  onClick={resetSettings}
                  style={{ padding: '2px 6px', fontSize: '10px', fontWeight: 600, borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#64748b', cursor: 'pointer' }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>
              {/* 1. Horizontal Offset (Left / Right) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                  <span>Horizontal (L/R):</span>
                  <span style={{ color: '#2563eb' }}>
                    {(settings.horizontalOffset || 0) > 0 ? `+${settings.horizontalOffset}mm (Right)` : (settings.horizontalOffset || 0) < 0 ? `${settings.horizontalOffset}mm (Left)` : '0mm (Center)'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button type="button" onClick={() => updateSettings({ horizontalOffset: Math.max(-8, (settings.horizontalOffset || 0) - 1) })} style={{ width: '24px', height: '22px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }} title="Shift Left">◀</button>
                  <input
                    type="range"
                    min="-8"
                    max="8"
                    step="0.5"
                    value={settings.horizontalOffset || 0}
                    onChange={e => updateSettings({ horizontalOffset: parseFloat(e.target.value) })}
                    style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <button type="button" onClick={() => updateSettings({ horizontalOffset: Math.min(8, (settings.horizontalOffset || 0) + 1) })} style={{ width: '24px', height: '22px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }} title="Shift Right">▶</button>
                </div>
              </div>

              {/* 2. Vertical Offset (Up / Down) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                  <span>Vertical Shift:</span>
                  <span style={{ color: '#2563eb' }}>{settings.verticalOffset > 0 ? `+${settings.verticalOffset}` : settings.verticalOffset} mm</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button type="button" onClick={() => updateSettings({ verticalOffset: Math.max(-10, settings.verticalOffset - 1) })} style={{ width: '24px', height: '22px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }} title="Nudge Up">▲</button>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="0.5"
                    value={settings.verticalOffset}
                    onChange={e => updateSettings({ verticalOffset: parseFloat(e.target.value) })}
                    style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <button type="button" onClick={() => updateSettings({ verticalOffset: Math.min(10, settings.verticalOffset + 1) })} style={{ width: '24px', height: '22px', fontSize: '11px', fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff', cursor: 'pointer' }} title="Nudge Down">▼</button>
                </div>
              </div>

              {/* 3. Item Gap / Spacing */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                  <span>Text & Item Gap:</span>
                  <span style={{ color: '#2563eb' }}>{settings.elementGap} mm</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.2"
                  value={settings.elementGap}
                  onChange={e => updateSettings({ elementGap: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>

              {/* 4. Barcode Height */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                  <span>Barcode Height:</span>
                  <span style={{ color: '#2563eb' }}>{settings.barcodeHeight} px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="38"
                  step="2"
                  value={settings.barcodeHeight}
                  onChange={e => updateSettings({ barcodeHeight: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>

              {/* 5. Bottom Safety Margin */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                  <span>Bottom Lift (Safety):</span>
                  <span style={{ color: '#2563eb' }}>{settings.bottomSafeMargin} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="0.5"
                  value={settings.bottomSafeMargin}
                  onChange={e => updateSettings({ bottomSafeMargin: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Live Printable Preview Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Live Sticker Preview ({BASE_CONFIG.printWidth} × {BASE_CONFIG.printHeight})
            </span>
            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
              ✓ WYSIWYG (Preview matches print output)
            </span>
          </div>

          {/* Printable Labels Grid */}
          <div id="barcode-print-area" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            justifyContent: 'center'
          }}>
            {Array.from({ length: copies }).map((_, idx) => (
              <div
                key={idx}
                className="barcode-sticker"
                style={{
                  position: 'relative',
                  width: BASE_CONFIG.cardWidth,
                  height: BASE_CONFIG.cardHeight,
                  backgroundColor: '#ffffff',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-xs)',
                  padding: '6px'
                }}
              >
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: settings.layoutMode === 'center' ? 'center' : settings.layoutMode === 'top' ? 'flex-start' : 'space-between',
                  gap: `${settings.elementGap * 3.2}px`,
                  transform: `translate(${(settings.horizontalOffset || 0) * 2.8}px, ${(settings.verticalOffset || 0) * 2.8}px)`,
                  paddingBottom: `${settings.bottomSafeMargin * 2.8}px`,
                  boxSizing: 'border-box'
                }}>
                  {/* 1. Store Name (Top) */}
                  <div style={{ width: '100%' }}>
                    <div style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: `${BASE_CONFIG.storeFontSize * scale}px`,
                      fontWeight: 900,
                      letterSpacing: '0.4px',
                      color: 'var(--color-primary, #1d4ed8)',
                      textTransform: 'uppercase',
                      lineHeight: '1.1',
                      width: '100%',
                      textAlign: 'center',
                      wordBreak: 'break-word'
                    }}>
                      {storeName}
                    </div>
                    <div style={{
                      fontSize: `${BASE_CONFIG.subFontSize * scale}px`,
                      fontWeight: 700,
                      letterSpacing: '0.2px',
                      color: '#64748b',
                      textTransform: 'uppercase',
                      marginTop: '1px',
                      lineHeight: 1,
                      width: '100%',
                      textAlign: 'center'
                    }}>

                    </div>
                  </div>

                  {/* 2. Product Name & Specs */}
                  <div style={{ width: '100%' }}>
                    <div style={{
                      fontSize: `${BASE_CONFIG.prodFontSize * scale}px`,
                      fontWeight: 800,
                      color: '#1e293b',
                      width: '100%',
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.15,
                      textAlign: 'center'
                    }}>
                      {productName}
                    </div>

                    {variant.sku && (
                      <div style={{
                        fontSize: `${BASE_CONFIG.skuFontSize * scale}px`,
                        fontWeight: 800,
                        color: '#1e293b',
                        marginTop: '1px',
                        textAlign: 'center',
                        width: '100%',
                        letterSpacing: '0.3px',
                        lineHeight: 1.15
                      }}>
                        {variant.sku}
                      </div>
                    )}


                  </div>

                  {/* 3. High Quality SVG Barcode */}
                  <div style={{ margin: '0 auto', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                    <svg ref={el => { barcodeRefs.current[idx] = el; }} style={{ maxWidth: '92%', height: 'auto', margin: '0 auto', display: 'block' }} />
                  </div>

                  {/* 4. Price Tag (Bottom) */}
                  {showPrice && (
                    <div style={{
                      borderTop: '1px dashed #cbd5e1',
                      width: '100%',
                      paddingTop: '3px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center'
                    }}>
                      {hasDiscount ? (
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', flexWrap: 'wrap', textAlign: 'center' }}>
                          <span style={{
                            fontSize: `${BASE_CONFIG.specFontSize * scale}px`,
                            fontWeight: 700,
                            color: '#94a3b8',
                            textDecoration: 'line-through'
                          }}>
                            ৳${baseEffectivePrice.toFixed(0)}
                          </span>
                          <span style={{
                            fontSize: `${BASE_CONFIG.offerFontSize * scale}px`,
                            fontWeight: 900,
                            color: '#e11d48'
                          }}>
                            ৳${discountPrice.toFixed(0)}
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          fontSize: `${BASE_CONFIG.priceFontSize * scale}px`,
                          fontWeight: 900,
                          color: 'var(--color-primary, #1d4ed8)',
                          letterSpacing: '0.3px',
                          lineHeight: 1.1,
                          width: '100%',
                          textAlign: 'center'
                        }}>
                          MRP: ৳{variant.selling_price.toFixed(2)}
                        </div>
                      )}

                      {hasDiscount && promoBadge && (
                        <div style={{
                          fontSize: `${BASE_CONFIG.subFontSize * scale}px`,
                          fontWeight: 800,
                          backgroundColor: '#ffe4e6',
                          color: '#e11d48',
                          padding: '1px 4px',
                          borderRadius: '2px',
                          letterSpacing: '0.3px',
                          textTransform: 'uppercase',
                          marginTop: '1px',
                          lineHeight: 1
                        }}>
                          {promoBadge}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eef2f6', paddingTop: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            🏷️ <strong>35mm × 45mm</strong> Thermal Sticker Label
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Printer size={14} /> Print {copies} {copies === 1 ? 'Sticker' : 'Stickers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface BatchPrintItem {
  variant: ProductVariant;
  productName: string;
  product?: Product;
  copies?: number;
}

export const printVariantsBatchLabels = (
  items: BatchPrintItem[],
  storeName: string = 'Blue Dream'
) => {
  if (!items || items.length === 0) return;

  const settings = getSavedSettings();
  const scale = (settings.fontScale || 100) / 100;
  const hOffset = settings.horizontalOffset || 0;
  const vOffset = settings.verticalOffset || 0;

  let iframe = document.getElementById('barcode-isolated-print-frame') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'barcode-isolated-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.zIndex = '-99999';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const stickerItemsHtml = items.flatMap(({ variant, productName, copies = 1 }) => {
    const finalPriceText = `MRP: ৳${Number(variant.selling_price).toFixed(2)}`;

    let svgHtml = '';
    const cleanBc = (variant.barcode || '').trim().replace(/[^0-9a-zA-Z]/g, '');
    if (cleanBc) {
      try {
        const itemSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(itemSvg, cleanBc, {
          format: 'CODE128',
          width: BASE_CONFIG.barcodeWidth,
          height: settings.barcodeHeight || 24,
          displayValue: true,
          fontSize: BASE_CONFIG.barcodeFontSize,
          font: 'sans-serif',
          fontOptions: 'bold',
          margin: 0,
          textMargin: 2
        });
        svgHtml = itemSvg.outerHTML;
      } catch (e) {
        console.error('Failed to generate barcode SVG for batch print', e);
      }
    }

    const numCopies = Math.max(1, copies);
    return Array.from({ length: numCopies }).map(() => `
      <div class="print-label">
        <div class="print-container" style="transform: translate(${hOffset}mm, ${vOffset}mm); gap: ${settings.elementGap}mm; padding-bottom: ${settings.bottomSafeMargin}mm; justify-content: ${settings.layoutMode === 'center' ? 'center' : settings.layoutMode === 'top' ? 'flex-start' : 'space-between'};">

          <!-- 1. Store Header -->
          <div class="print-header" style="gap: ${Math.max(0.2, settings.elementGap * 0.4)}mm;">
            <div class="store-title" style="font-size: ${(BASE_CONFIG.storeFontSize * scale).toFixed(1)}px;">${storeName}</div>
            <div class="store-sub" style="font-size: ${(BASE_CONFIG.subFontSize * scale).toFixed(1)}px;"></div>
          </div>

          <!-- 2. Product Name & Specs -->
          <div class="product-info" style="gap: ${Math.max(0.2, settings.elementGap * 0.4)}mm;">
            <div class="product-title" style="font-size: ${(BASE_CONFIG.prodFontSize * scale).toFixed(1)}px;">${productName}</div>
            ${variant.sku ? `<div class="product-sku" style="font-size: ${(BASE_CONFIG.skuFontSize * scale).toFixed(1)}px;">${variant.sku}</div>` : ''}
          </div>

          <!-- 3. Barcode SVG -->
          <div class="barcode-box">
            ${svgHtml}
          </div>

          <!-- 4. Price Tag (Bottom) -->
          <div class="price-box">
            <div class="price-mrp" style="font-size: ${(BASE_CONFIG.priceFontSize * scale).toFixed(1)}px;">
              ${finalPriceText}
            </div>
          </div>
        </div>
      </div>
    `);
  }).join('');

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title> </title>
        <style>
          @page {
            size: 35mm 45mm;
            margin: 0mm !important;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 35mm !important;
            min-height: 45mm !important;
            height: auto !important;
            background: #ffffff !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', 'Plus Jakarta Sans', sans-serif;
            text-align: center !important;
            overflow: visible !important;
          }
          .print-wrapper {
            width: 35mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .print-label {
            display: block !important;
            width: 35mm !important;
            height: 44.5mm !important;
            max-width: 35mm !important;
            max-height: 44.5mm !important;
            margin: 0 auto !important;
            padding: 1.5mm 1.5mm !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          .print-label:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-container {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            box-sizing: border-box !important;
          }
          .print-header {
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .store-title {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif !important;
            font-weight: 900 !important;
            letter-spacing: 0.4px !important;
            color: #000000 !important;
            text-transform: uppercase !important;
            line-height: 1.1 !important;
            margin: 0 !important;
            text-align: center !important;
            width: 100% !important;
            max-width: 32mm !important;
            word-break: break-word !important;
          }
          .store-sub {
            font-weight: 700 !important;
            letter-spacing: 0.2px !important;
            color: #222222 !important;
            text-transform: uppercase !important;
            line-height: 1 !important;
            text-align: center !important;
            width: 100% !important;
          }
          .product-info {
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .product-title {
            font-weight: 800 !important;
            color: #000000 !important;
            line-height: 1.15 !important;
            text-align: center !important;
            word-break: break-word !important;
            overflow: hidden !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            max-width: 32mm !important;
          }
          .product-sku {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', 'Plus Jakarta Sans', sans-serif !important;
            font-weight: 800 !important;
            color: #111111 !important;
            letter-spacing: 0.3px !important;
            line-height: 1.1 !important;
            text-align: center !important;
            max-width: 32mm !important;
          }
          .product-spec {
            color: #000000 !important;
            font-weight: 800 !important;
            line-height: 1.1 !important;
            text-align: center !important;
            max-width: 32mm !important;
          }
          .barcode-box {
            width: 100% !important;
            max-width: 32mm !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            text-align: center !important;
            overflow: hidden !important;
          }
          svg {
            width: 92% !important;
            max-width: 31mm !important;
            height: auto !important;
            display: block !important;
            margin: 0 auto !important;
            text-align: center !important;
          }
          svg text {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', sans-serif !important;
            font-weight: 800 !important;
            fill: #000000 !important;
            letter-spacing: 0.4px !important;
          }
          .price-box {
            width: 100% !important;
            max-width: 32mm !important;
            border-top: 1px dashed #000000 !important;
            padding-top: 0.6mm !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
          }
          .price-mrp {
            font-weight: 900 !important;
            color: #000000 !important;
            letter-spacing: 0.3px !important;
            line-height: 1.1 !important;
            text-align: center !important;
            width: 100% !important;
          }
        </style>
      </head>
      <body>
        <div class="print-wrapper">
          ${stickerItemsHtml}
        </div>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 350);
};



