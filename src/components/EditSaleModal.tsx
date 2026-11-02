import React, { useState, useEffect, useRef, useMemo } from 'react';
import { dbService } from '../dbService';
import { useNotificationStore } from '../store';
import type { ProductVariant } from '../store';
import { X, Trash2, Plus, Minus, Search, AlertTriangle, Save, Barcode, CheckCircle2 } from 'lucide-react';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface EditSaleModalProps {
  sale: any;
  initialItems: any[];
  onClose: () => void;
  onSuccess: () => void;
}

interface EditableSaleItem {
  id?: string; // existing sale_item id if from original sale
  variant_id: string;
  name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  originalQuantity: number;
  unit_price: number;
  current_stock: number;
  sale_type?: 'SALE' | 'RETURN';
}

export const EditSaleModal: React.FC<EditSaleModalProps> = ({
  sale,
  initialItems,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useNotificationStore();
  const [items, setItems] = useState<EditableSaleItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(sale.discount_amount || 0);
  const [paymentMethod, setPaymentMethod] = useState<string>(sale.payment_method || 'CASH');
  const [receivedAmount, setReceivedAmount] = useState<number>(sale.received_amount ?? sale.payable_amount);
  const [customerPhone, setCustomerPhone] = useState<string>(sale.customer_phone || '');
  const [customerName, setCustomerName] = useState<string>(sale.customer_name || '');
  const [guarantorName, setGuarantorName] = useState<string>(sale.guarantor_name || '');
  const [guarantorPhone, setGuarantorPhone] = useState<string>(sale.guarantor_phone || '');
  const [saving, setSaving] = useState(false);

  // Variant search & scanner state
  const [variantsList, setVariantsList] = useState<ProductVariant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load variants to know current stock & enable adding items
    const loadVariantsAndInit = async () => {
      try {
        const variants = await dbService.getVariants();
        setVariantsList(variants);

        const variantMap = new Map(variants.map((v) => [v.id, v]));

        const formattedItems: EditableSaleItem[] = initialItems.map((it) => {
          const v = variantMap.get(it.variant_id) || it.variant;
          return {
            id: it.id,
            variant_id: it.variant_id,
            name: v?.product?.name || it.variant?.product?.name || 'Product',
            sku: v?.sku || it.variant?.sku,
            barcode: v?.barcode || it.variant?.barcode,
            quantity: it.quantity,
            originalQuantity: it.quantity,
            unit_price: it.unit_price || (it.total_price / (it.quantity || 1)),
            current_stock: v ? v.stock_quantity : 0,
            sale_type: it.sale_type || 'SALE',
            return_date: it.return_date || null,
          };
        });

        setItems(formattedItems);
      } catch (e) {
        console.error('Error loading variants for sale edit', e);
      }
    };

    loadVariantsAndInit();
  }, [sale, initialItems]);

  // Focus search input automatically on modal mount
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, []);

  // Barcode Map lookup memoization for instant O(1) scanner response
  const barcodeMap = useMemo(() => {
    const map = new Map<string, ProductVariant>();
    variantsList.forEach((v) => {
      if (v.barcode) {
        const raw = v.barcode.trim();
        const unhyphenated = raw.replace(/[\s-]/g, '');
        map.set(raw, v);
        map.set(raw.toLowerCase(), v);
        map.set(unhyphenated, v);
        map.set(unhyphenated.toLowerCase(), v);
      }
      if (v.sku) {
        const rawSku = v.sku.trim();
        const unhyphenatedSku = rawSku.replace(/[\s-]/g, '');
        map.set(rawSku, v);
        map.set(rawSku.toLowerCase(), v);
        map.set(unhyphenatedSku, v);
        map.set(unhyphenatedSku.toLowerCase(), v);
      }
    });
    return map;
  }, [variantsList]);

  const findMatchingVariant = (queryText: string): ProductVariant | undefined => {
    const raw = (queryText || '').trim().replace(/[\r\n\t]/g, '');
    if (!raw) return undefined;
    const clean = raw.replace(/[\s-]/g, '').toLowerCase();

    // 1. Direct Map lookup (O(1))
    const fromMap = barcodeMap.get(raw) || barcodeMap.get(raw.toLowerCase()) || barcodeMap.get(clean);
    if (fromMap) return fromMap;

    // 2. Exact or stripped barcode in variants list
    const match = variantsList.find((v) => {
      if (!v.barcode) return false;
      const bc = v.barcode.trim().toLowerCase();
      const cleanBc = bc.replace(/[\s-]/g, '');
      return bc === raw.toLowerCase() || cleanBc === clean;
    });
    if (match) return match;

    // 3. Exact SKU match
    const skuMatch = variantsList.find((v) => {
      if (!v.sku) return false;
      const sku = v.sku.trim().toLowerCase();
      return sku === raw.toLowerCase() || sku.replace(/[\s-]/g, '') === clean;
    });
    return skuMatch;
  };

  // Filter search results
  const searchResults = useMemo(() => {
    const qTrim = searchQuery.trim();
    if (!qTrim) return [];
    const q = qTrim.toLowerCase();
    const cleanQ = q.replace(/[\s-]/g, '');

    const matches: ProductVariant[] = [];
    for (let i = 0; i < variantsList.length; i++) {
      const v = variantsList[i];
      if (
        (v.sku && (v.sku.toLowerCase().includes(q) || v.sku.toLowerCase().replace(/[\s-]/g, '').includes(cleanQ))) ||
        (v.barcode && (v.barcode.toLowerCase().includes(q) || v.barcode.toLowerCase().replace(/[\s-]/g, '').includes(cleanQ))) ||
        (v.product?.name && v.product.name.toLowerCase().includes(q))
      ) {
        matches.push(v);
        if (matches.length >= 10) break;
      }
    }
    return matches;
  }, [searchQuery, variantsList]);

  // Handle Search Input Change
  useEffect(() => {
    if (searchQuery.trim()) {
      setShowSearchResults(true);
    } else {
      setShowSearchResults(false);
    }
  }, [searchQuery]);

  const handleAddItem = (variant: ProductVariant) => {
    // Check if already in items
    const existingIndex = items.findIndex((it) => it.variant_id === variant.id);
    if (existingIndex >= 0) {
      // Increase quantity
      handleQuantityChange(existingIndex, items[existingIndex].quantity + 1);
    } else {
      const newItem: EditableSaleItem = {
        variant_id: variant.id,
        name: variant.product?.name || 'Product',
        sku: variant.sku,
        barcode: variant.barcode,
        quantity: 1,
        originalQuantity: 0,
        unit_price: variant.selling_price || 0,
        current_stock: variant.stock_quantity,
        sale_type: 'SALE',
      };
      setItems([...items, newItem]);
    }
    setSearchQuery('');
    setShowSearchResults(false);
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setTimeout(() => searchInputRef.current?.focus(), 10);
  };

  // Hardware scanner rapid key buffer listener
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalScannerKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is pressing functional modal keys
      if (e.key === 'Escape') return;

      const target = e.target as HTMLElement | null;
      const isOtherInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== searchInputRef.current;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Reset buffer if elapsed time between keys > 90ms (scanner sends keys in ~10-40ms bursts)
      if (timeDiff > 90) {
        scanBuffer = '';
      }

      if (e.key === 'Enter') {
        const rawBuffer = scanBuffer.trim();
        const candidate = rawBuffer.length >= 3 ? rawBuffer : (searchInputRef.current?.value?.trim() || '');
        if (candidate.length >= 2) {
          const match = findMatchingVariant(candidate);
          if (match) {
            e.preventDefault();
            e.stopPropagation();
            setLastScannedBarcode(match.barcode || match.sku || candidate);
            handleAddItem(match);
            showToast(`Scanned: ${match.product?.name}`, 'success');
            scanBuffer = '';
            return;
          }
        }
        scanBuffer = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBuffer += e.key;

        // Redirect focus to search input if typing is fast scanner input
        if (!isOtherInput && document.activeElement !== searchInputRef.current) {
          searchInputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalScannerKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalScannerKeyDown);
  }, [barcodeMap, variantsList, items]);

  // Handle Search Input KeyDown (e.g. Enter pressed by handheld scanner)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = searchQuery.trim();
      if (!raw) return;

      // 1. Direct barcode/sku match
      const exactMatch = findMatchingVariant(raw);
      if (exactMatch) {
        setLastScannedBarcode(exactMatch.barcode || exactMatch.sku || raw);
        handleAddItem(exactMatch);
        showToast(`Added: ${exactMatch.product?.name}`, 'success');
        return;
      }

      // 2. If single search result is visible, pick it
      if (searchResults.length === 1) {
        handleAddItem(searchResults[0]);
        showToast(`Added: ${searchResults[0].product?.name}`, 'success');
        return;
      }

      if (searchResults.length === 0) {
        showToast(`No product found for "${raw}"`, 'warning');
      }
    }
  };

  const handleQuantityChange = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const it = items[index];
    // Maximum allowable quantity = current_stock + originalQuantity (already allocated)
    const maxAvailable = it.current_stock + it.originalQuantity;
    if (newQty > maxAvailable) {
      showToast(`Only ${maxAvailable} units available in stock for ${it.name}!`, 'warning');
      return;
    }

    const updated = [...items];
    updated[index] = { ...it, quantity: newQty };
    setItems(updated);
  };

  const handlePriceChange = (index: number, price: number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], unit_price: Math.max(0, price) };
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showToast('A sale must have at least 1 item. If you wish to cancel the sale completely, use the Delete button.', 'warning');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = items.reduce((acc, it) => acc + (it.quantity * it.unit_price), 0);
  const payable = Math.max(0, subtotal - (Number(discountAmount) || 0));
  const due = paymentMethod === 'DUE' ? payable : Math.max(0, payable - (Number(receivedAmount) || 0));
  const change = receivedAmount > payable ? receivedAmount - payable : 0;

  const handleSave = async () => {
    if (items.length === 0) {
      showToast('Sale must contain at least 1 item.', 'error');
      return;
    }

    // Validate quantities
    for (const it of items) {
      if (it.quantity <= 0) {
        showToast(`Quantity for "${it.name}" must be greater than 0`, 'error');
        return;
      }
      const maxAvailable = it.current_stock + it.originalQuantity;
      if (it.quantity > maxAvailable) {
        showToast(`Cannot sell ${it.quantity} units of ${it.name}. Only ${maxAvailable} available!`, 'error');
        return;
      }
    }

    try {
      setSaving(true);
      await dbService.updateSale(
        sale.id,
        {
          discount_amount: Number(discountAmount) || 0,
          payment_method: paymentMethod,
          received_amount: Number(receivedAmount) || 0,
          customer_phone: customerPhone.trim(),
          customer_name: customerName.trim(),
          guarantor_name: guarantorName.trim(),
          guarantor_phone: guarantorPhone.trim(),
        },
        items.map((it) => ({
          id: it.id,
          variant_id: it.variant_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.quantity * it.unit_price,
          sale_type: it.sale_type || 'SALE',
        }))
      );

      showToast('Invoice updated successfully! Stock adjusted.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to update sale', err);
      showToast(err.message || 'Failed to update sale invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(11, 37, 69, 0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)' }}>
                Edit Sale Invoice
              </h3>
              <span
                style={{
                  fontFamily: 'monospace',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                #{sale.id.toUpperCase().substring(0, 8)}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
              Original Date: {formatDateDDMMYYYY(sale.sale_date)} • Stock quantities will auto-recalculate
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={saving}
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
          
          {/* Customer & Guarantor Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Customer Name
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Customer Phone
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 01700000000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Guarantor Name (জামানতকারী)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Guarantor Name"
                value={guarantorName}
                onChange={(e) => setGuarantorName(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Guarantor Phone
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 01800000000"
                value={guarantorPhone}
                onChange={(e) => setGuarantorPhone(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Payment Method
              </label>
              <select
                className="form-control"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px' }}
              >
                <option value="CASH">CASH</option>
                <option value="CARD">CARD / POS</option>
                <option value="MOBILE_PAY">bKash / Nagad / Rocket</option>
                <option value="DUE">DUE</option>
                <option value="SPLIT">SPLIT PAYMENT</option>
              </select>
            </div>
          </div>

          {/* Barcode Scanner & Search Bar */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                <Barcode size={15} style={{ color: 'var(--color-primary)' }} />
                <span>Scan Barcode or Search Item to Add</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: '#16a34a', fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span>
                <span>Scanner Active (Point &amp; Scan)</span>
              </div>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={15} style={{ position: 'absolute', left: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="form-control"
                placeholder="Scan barcode sticker with scanner gun, or type product name / SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                style={{
                  paddingLeft: '34px',
                  paddingRight: '100px',
                  height: '38px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #cbd5e1',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              />
              <div style={{ position: 'absolute', right: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {lastScannedBarcode && (
                  <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '3px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <CheckCircle2 size={11} /> {lastScannedBarcode}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  Focus Scanner
                </button>
              </div>
            </div>

            {/* Autocomplete Dropdown */}
            {showSearchResults && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 20,
                  marginTop: '4px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {searchResults.length === 0 ? (
                  <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    No matching products found for "{searchQuery}".
                  </div>
                ) : (
                  searchResults.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => handleAddItem(v)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '12px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                    >
                      <div>
                        <span style={{ fontWeight: 600 }}>{v.product?.name}</span>
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {v.sku || v.barcode}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: v.stock_quantity > 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                          Stock: {v.stock_quantity}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                          ৳{v.selling_price.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Items Table */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Invoice Items ({items.length})
            </label>
            <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <th>Product &amp; Variant</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Stock Left</th>
                    <th style={{ width: '130px', textAlign: 'center' }}>Quantity</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Unit Price (৳)</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Total (৳)</th>
                    <th style={{ width: '45px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const maxAvail = it.current_stock + it.originalQuantity;
                    const diff = it.quantity - it.originalQuantity;
                    return (
                      <tr key={it.id || it.variant_id + idx}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{it.name}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {it.barcode ? `${it.barcode}` : (it.sku ? `${it.sku}` : '')}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '11.5px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: it.current_stock <= 2 ? '#fee2e2' : '#f0fdf4',
                              color: it.current_stock <= 2 ? 'var(--color-danger)' : 'var(--color-success)',
                            }}
                          >
                            {it.current_stock} pcs
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ width: '26px', height: '26px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={() => handleQuantityChange(idx, it.quantity - 1)}
                              disabled={it.quantity <= 1}
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={maxAvail}
                              className="form-control"
                              value={it.quantity}
                              onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                              style={{ width: '46px', height: '26px', textAlign: 'center', padding: '0 2px', fontSize: '12px', fontWeight: 600 }}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ width: '26px', height: '26px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={() => handleQuantityChange(idx, it.quantity + 1)}
                              disabled={it.quantity >= maxAvail}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          {diff !== 0 && (
                            <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '2px', color: diff > 0 ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                              {diff > 0 ? `+${diff} sold (stock -${diff})` : `${diff} returned (stock +${Math.abs(diff)})`}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control"
                            value={it.unit_price}
                            onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                            style={{ width: '80px', height: '26px', textAlign: 'right', padding: '0 4px', fontSize: '12px', display: 'inline-block' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '12.5px' }}>
                          ৳{(it.quantity * it.unit_price).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleRemoveItem(idx)}
                            style={{ color: 'var(--color-danger)', padding: '2px 4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financials & Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Subtotal</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                ৳{subtotal.toFixed(2)}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Discount (৳)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                style={{ height: '28px', fontSize: '12.5px', fontWeight: 600, width: '110px' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Payable</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-primary)' }}>
                ৳{payable.toFixed(2)}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Paid Amount (৳)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                style={{ height: '28px', fontSize: '12.5px', fontWeight: 600, width: '110px' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{due > 0 ? 'Due Amount' : 'Change Return'}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: due > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                ৳{due > 0 ? due.toFixed(2) : change.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <AlertTriangle size={13} style={{ color: 'var(--color-warning)' }} />
            Saving will adjust product stock quantities and update stock ledger entries automatically.
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving} style={{ padding: '6px 14px' }}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || items.length === 0}
            style={{ padding: '6px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
