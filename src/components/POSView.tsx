import React, { useState, useEffect, useRef } from 'react';
import { usePOSStore, useNotificationStore } from '../store';
import type { ProductVariant } from '../store';
import { dbService } from '../dbService';
import { Search, Trash2, Plus, Minus, Printer, RotateCcw, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { InvoicePrintModal, type InvoiceData } from './InvoicePrintModal';

interface POSViewProps {
  onRefreshStats: () => void;
}

export const POSView: React.FC<POSViewProps> = ({ onRefreshStats }) => {
  const { showToast } = useNotificationStore();
  const { 
    cart, 
    discount, 
    addToCart, 
    removeFromCart, 
    updateCartQty, 
    updateCartPrice, 
    clearCart, 
    setDiscount
  } = usePOSStore();

  const [posMode, setPosMode] = useState<'SALE' | 'RETURN'>('SALE');
  
  // Search queries & dropdown visibility states
  const [saleSearchQuery, setSaleSearchQuery] = useState('');
  const [showSaleDropdown, setShowSaleDropdown] = useState(false);
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [showReturnDropdown, setShowReturnDropdown] = useState(false);
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState('');
  const [showExchangeDropdown, setShowExchangeDropdown] = useState(false);

  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState<InvoiceData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');

  const [paymentRows, setPaymentRows] = useState<{ method: string; amount: number }[]>([{ method: 'CASH', amount: 0 }]);
  const [checkingOut, setCheckingOut] = useState(false);

  // Input & Container refs
  const saleInputRef = useRef<HTMLInputElement>(null);
  const returnInputRef = useRef<HTMLInputElement>(null);
  const exchangeInputRef = useRef<HTMLInputElement>(null);
  const saleSearchContainerRef = useRef<HTMLFormElement>(null);
  const returnSearchContainerRef = useRef<HTMLFormElement>(null);
  const exchangeSearchContainerRef = useRef<HTMLFormElement>(null);

  // Load all product variants for scanning lookup
  const loadVariants = async () => {
    const list = await dbService.getVariants();
    setVariants(list);
  };

  useEffect(() => {
    loadVariants();
  }, []);

  // Close search dropdowns when clicking anywhere outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (saleSearchContainerRef.current && !saleSearchContainerRef.current.contains(e.target as Node)) {
        setShowSaleDropdown(false);
      }
      if (returnSearchContainerRef.current && !returnSearchContainerRef.current.contains(e.target as Node)) {
        setShowReturnDropdown(false);
      }
      if (exchangeSearchContainerRef.current && !exchangeSearchContainerRef.current.contains(e.target as Node)) {
        setShowExchangeDropdown(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSaleDropdown(false);
        setShowReturnDropdown(false);
        setShowExchangeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Focus the appropriate search input when switching modes
  useEffect(() => {
    if (posMode === 'SALE') {
      saleInputRef.current?.focus();
    } else {
      returnInputRef.current?.focus();
    }
  }, [posMode]);

  // Barcode Map lookup memoization for instant 0ms scanner response
  const barcodeMap = React.useMemo(() => {
    const map = new Map<string, ProductVariant>();
    variants.forEach(v => {
      if (v.barcode) {
        const raw = v.barcode.trim();
        const unhyphenated = raw.replace(/[\s-]/g, '');
        map.set(raw, v);
        map.set(raw.toLowerCase(), v);
        map.set(unhyphenated, v);
        map.set(unhyphenated.toLowerCase(), v);
      }
      if (v.sku) {
        map.set(v.sku.trim(), v);
        map.set(v.sku.trim().toLowerCase(), v);
      }
    });
    return map;
  }, [variants]);

  const findMatchingVariant = (queryText: string): ProductVariant | undefined => {
    const raw = (queryText || '').trim().replace(/[\r\n\t]/g, '');
    if (!raw) return undefined;
    const clean = raw.replace(/[\s-]/g, '').toLowerCase();

    // 1. Direct Map lookup (O(1))
    const fromMap = barcodeMap.get(raw) || barcodeMap.get(raw.toLowerCase()) || barcodeMap.get(clean);
    if (fromMap) return fromMap;

    // 2. Exact or stripped barcode in variants list
    const match = variants.find(v => {
      if (!v.barcode) return false;
      const bc = v.barcode.trim().toLowerCase();
      const cleanBc = bc.replace(/[\s-]/g, '');
      return bc === raw.toLowerCase() || cleanBc === clean;
    });
    if (match) return match;

    // 3. Exact SKU match
    const skuMatch = variants.find(v => {
      if (!v.sku) return false;
      const sku = v.sku.trim().toLowerCase();
      return sku === raw.toLowerCase() || sku.replace(/[\s-]/g, '') === clean;
    });
    return skuMatch;
  };

  // Helper search filter
  const filterVariants = (qTrim: string) => {
    if (!qTrim) return [];
    const exact = findMatchingVariant(qTrim);
    if (exact) return [exact];

    const q = qTrim.toLowerCase();
    const cleanQ = q.replace(/[\s-]/g, '');
    const matches: ProductVariant[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (
        (v.sku && (v.sku.toLowerCase().includes(q) || v.sku.toLowerCase().replace(/[\s-]/g, '').includes(cleanQ))) ||
        (v.barcode && (v.barcode.toLowerCase().includes(q) || v.barcode.toLowerCase().replace(/[\s-]/g, '').includes(cleanQ))) ||
        (v.product?.name && v.product.name.toLowerCase().includes(q))
      ) {
        matches.push(v);
        if (matches.length >= 15) break;
      }
    }
    return matches;
  };

  const saleSearchResults = React.useMemo(() => filterVariants(saleSearchQuery), [saleSearchQuery, variants, barcodeMap]);
  const returnSearchResults = React.useMemo(() => filterVariants(returnSearchQuery), [returnSearchQuery, variants, barcodeMap]);
  const exchangeSearchResults = React.useMemo(() => filterVariants(exchangeSearchQuery), [exchangeSearchQuery, variants, barcodeMap]);

  // Split Cart into Return Items and Sale/Exchange Items
  const returnItems = cart.filter(item => item.saleType === 'RETURN');
  const saleItems = cart.filter(item => item.saleType !== 'RETURN');

  // Financial Calculations
  const salesSubtotal = saleItems.reduce((acc, item) => {
    const itemPrice = item.customPrice !== undefined 
      ? item.customPrice 
      : item.variant.selling_price;
    return acc + (item.quantity * itemPrice);
  }, 0);

  const returnsTotal = returnItems.reduce((acc, item) => {
    const itemPrice = item.customPrice !== undefined ? item.customPrice : item.variant.selling_price;
    return acc + (item.quantity * itemPrice);
  }, 0);

  // Active subtotal based on mode
  const netSubtotal = posMode === 'SALE' ? salesSubtotal : (salesSubtotal - returnsTotal);
  const payableAmount = netSubtotal - discount;
  
  // Return / Exchange states
  const isPureReturn = posMode === 'RETURN' && returnItems.length > 0 && saleItems.length === 0;
  const isExchange = posMode === 'RETURN' && returnItems.length > 0 && saleItems.length > 0;
  const isRefund = payableAmount < 0;
  const isEvenExchange = posMode === 'RETURN' && payableAmount === 0 && (returnItems.length > 0 || saleItems.length > 0);
  const refundAmount = isRefund ? Math.abs(payableAmount) : 0;

  const totalReceived = paymentRows.reduce((acc, r) => acc + (r.amount || 0), 0);
  const changeAmount = payableAmount > 0 && totalReceived > payableAmount ? totalReceived - payableAmount : 0;
  const dueAmount = payableAmount > 0 && totalReceived < payableAmount ? payableAmount - totalReceived : 0;

  const removePaymentRow = (idx: number) => setPaymentRows(prev => prev.filter((_, i) => i !== idx));
  const updatePaymentRow = (idx: number, field: 'method' | 'amount', value: string | number) =>
    setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  
  const fillRemaining = (idx: number) => {
    const otherTotal = paymentRows.reduce((acc, r, i) => i !== idx ? acc + (r.amount || 0) : acc, 0);
    const remaining = Math.max(0, payableAmount - otherTotal);
    updatePaymentRow(idx, 'amount', remaining);
  };

  const handleNewSale = () => {
    clearCart();
    setCheckoutSuccess(null);
    setShowReceipt(false);
    setSaleSearchQuery('');
    setReturnSearchQuery('');
    setExchangeSearchQuery('');
    setCustomerPhone('');
    setCustomerName('');
    setGuarantorName('');
    setGuarantorPhone('');
    setDiscount(0);
    setPaymentRows([{ method: 'CASH', amount: 0 }]);
    setTimeout(() => {
      if (posMode === 'SALE') saleInputRef.current?.focus();
      else returnInputRef.current?.focus();
    }, 50);
  };

  const handleSwitchMode = (newMode: 'SALE' | 'RETURN') => {
    if (posMode === newMode) return;
    clearCart();
    setCheckoutSuccess(null);
    setShowReceipt(false);
    setSaleSearchQuery('');
    setReturnSearchQuery('');
    setExchangeSearchQuery('');
    setCustomerPhone('');
    setCustomerName('');
    setGuarantorName('');
    setGuarantorPhone('');
    setDiscount(0);
    setPaymentRows([{ method: 'CASH', amount: 0 }]);
    setPosMode(newMode);
    setTimeout(() => {
      if (newMode === 'SALE') saleInputRef.current?.focus();
      else returnInputRef.current?.focus();
    }, 50);
  };

  const addItemToCart = (variant: ProductVariant, type: 'SALE' | 'RETURN') => {
    if (checkoutSuccess || showReceipt) {
      clearCart();
      setCheckoutSuccess(null);
      setShowReceipt(false);
      setCustomerPhone('');
      setCustomerName('');
      setGuarantorName('');
      setGuarantorPhone('');
      setDiscount(0);
      setPaymentRows([{ method: 'CASH', amount: 0 }]);
    }

    if (type === 'RETURN') {
      addToCart(variant, 'RETURN');
      showToast(`Added "${variant.product?.name}" to Returned Items`, 'info');
      setReturnSearchQuery('');
      if (returnInputRef.current) returnInputRef.current.value = '';
      setTimeout(() => returnInputRef.current?.focus(), 10);
      return;
    }

    // Sale or Exchange Item
    if (variant.stock_quantity <= 0) {
      showToast(`Warning: ${variant.product?.name} is out of stock!`, 'warning');
    }

    addToCart(variant, 'SALE');
    if (posMode === 'SALE') {
      setSaleSearchQuery('');
      if (saleInputRef.current) saleInputRef.current.value = '';
      setTimeout(() => saleInputRef.current?.focus(), 10);
    } else {
      showToast(`Added "${variant.product?.name}" to Exchanged Items`, 'success');
      setExchangeSearchQuery('');
      if (exchangeInputRef.current) exchangeInputRef.current.value = '';
      setTimeout(() => exchangeInputRef.current?.focus(), 10);
    }
  };

  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    return localStorage.getItem('pos_auto_print') === 'true';
  });

  const toggleAutoPrint = (val: boolean) => {
    setAutoPrint(val);
    localStorage.setItem('pos_auto_print', val ? 'true' : 'false');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    if (payableAmount > 0 && totalReceived <= 0) {
      showToast('Please enter at least one payment amount.', 'warning');
      return;
    }

    const activeMethods = paymentRows.filter(r => r.amount > 0).map(r => r.method);
    const finalMethod = payableAmount <= 0 
      ? 'CASH' 
      : (activeMethods.length === 1 ? activeMethods[0] : (activeMethods.length > 1 ? 'SPLIT' : 'CASH'));
    const finalReceived = payableAmount <= 0 ? 0 : totalReceived;

    try {
      setCheckingOut(true);
      showToast('Processing transaction...', 'info');
      const saleResult = await dbService.checkoutSale(
        cart,
        discount,
        finalMethod,
        finalReceived,
        customerPhone,
        customerName,
        guarantorName,
        guarantorPhone
      );

      const saleId = typeof saleResult === 'string' ? saleResult : saleResult.id;
      const invoiceCode = typeof saleResult === 'object' ? saleResult.invoice_code : undefined;

      const invoiceData: InvoiceData = {
        invoiceId: saleId,
        invoiceCode: invoiceCode,
        saleDate: new Date().toISOString(),
        paymentMethod: finalMethod,
        customerPhone: customerPhone,
        customerName: customerName,
        guarantorName: guarantorName,
        guarantorPhone: guarantorPhone,
        totalAmount: netSubtotal,
        discountAmount: discount,
        payableAmount: payableAmount,
        receivedAmount: finalReceived,
        dueAmount: dueAmount,
        changeAmount: changeAmount,
        paymentRows: paymentRows,
        items: cart.map(item => {
          const isReturn = item.saleType === 'RETURN';
          const itemPrice = item.customPrice !== undefined 
            ? item.customPrice 
            : item.variant.selling_price;
          return {
            name: item.variant.product?.name || 'Item',
            sku: item.variant.sku,
            barcode: item.variant.barcode,
            code: item.variant.sku || item.variant.barcode,
            quantity: item.quantity,
            unitPrice: itemPrice,
            totalPrice: isReturn ? -(item.quantity * itemPrice) : (item.quantity * itemPrice),
            saleType: item.saleType || 'SALE'
          };
        })
      };

      setLastCompletedInvoice(invoiceData);
      setCheckoutSuccess(saleId);
      setShowReceipt(true);
      onRefreshStats();
      loadVariants();
      showToast(
        isPureReturn ? 'Return & Refund completed successfully!' :
        isRefund ? 'Exchange & Refund completed successfully!' :
        isEvenExchange ? 'Even Exchange completed successfully!' :
        'Sale completed successfully!', 
        'success'
      );
    } catch (err) {
      console.error(err);
      showToast('Failed to complete transaction', 'error');
    } finally {
      setCheckingOut(false);
    }
  };

  // Global scanner listener & POS quick keys (F2 = checkout, Ctrl+F = focus, Esc = new sale)
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus active search on Ctrl + F
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        if (posMode === 'SALE') saleInputRef.current?.focus();
        else returnInputRef.current?.focus();
        return;
      }

      // Quick Checkout on F2 or Ctrl + Enter
      if (e.key === 'F2' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (cart.length > 0 && !checkingOut) {
          handleCheckout();
        }
        return;
      }

      // Quick Reset on Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showReceipt) {
          handleNewSale();
        }
        return;
      }

      const activeEl = document.activeElement;
      const isOtherInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && 
        activeEl !== saleInputRef.current && 
        activeEl !== returnInputRef.current && 
        activeEl !== exchangeInputRef.current;
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Reset buffer if elapsed time between keys > 100ms
      if (timeDiff > 100) {
        scanBuffer = '';
      }

      if (e.key === 'Enter') {
        const rawBuffer = scanBuffer.trim();
        const liveInputVal = (activeEl === exchangeInputRef.current 
          ? exchangeInputRef.current?.value 
          : (activeEl === returnInputRef.current ? returnInputRef.current?.value : saleInputRef.current?.value))?.trim() || '';
        const candidate = rawBuffer.length >= 4 ? rawBuffer : liveInputVal;
        
        if (candidate.length >= 2) {
          const match = findMatchingVariant(candidate);
          if (match) {
            e.preventDefault();
            const targetType = (posMode === 'RETURN' && activeEl !== exchangeInputRef.current) ? 'RETURN' : 'SALE';
            addItemToCart(match, targetType);
            scanBuffer = '';
            return;
          }
        }
        scanBuffer = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBuffer += e.key;
        if (!isOtherInput && activeEl !== saleInputRef.current && activeEl !== returnInputRef.current && activeEl !== exchangeInputRef.current) {
          if (posMode === 'SALE') saleInputRef.current?.focus();
          else returnInputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [barcodeMap, variants, checkoutSuccess, showReceipt, cart, checkingOut, totalReceived, payableAmount, autoPrint, posMode]);

  return (
    <div className="pos-layout">
      {/* LEFT: Main POS Area with Tabs */}
      <div className="pos-main" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Top Tab Switcher */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#fff', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => handleSwitchMode('SALE')}
            style={{
              padding: '8px 24px',
              fontSize: '14px',
              fontWeight: 800,
              borderRadius: '6px',
              border: posMode === 'SALE' ? '1.5px solid var(--color-primary)' : '1.5px solid #cbd5e1',
              background: posMode === 'SALE' ? 'var(--color-primary)' : '#f1f5f9',
              color: posMode === 'SALE' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '40px',
              transition: 'all 0.15s ease',
              boxShadow: posMode === 'SALE' ? '0 2px 6px rgba(11, 37, 69, 0.25)' : 'none'
            }}
          >
            Sale
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('RETURN')}
            style={{
              padding: '8px 24px',
              fontSize: '14px',
              fontWeight: 800,
              borderRadius: '6px',
              border: posMode === 'RETURN' ? '1.5px solid #b91c1c' : '1.5px solid #fca5a5',
              background: posMode === 'RETURN' ? '#dc2626' : '#fee2e2',
              color: posMode === 'RETURN' ? '#ffffff' : '#b91c1c',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '40px',
              transition: 'all 0.15s ease',
              boxShadow: posMode === 'RETURN' ? '0 2px 6px rgba(220, 38, 38, 0.35)' : 'none'
            }}
          >
            Return/Exchange
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {cart.length > 0 && (
              <button 
                onClick={handleNewSale}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '12px', height: '34px', padding: '0 14px', fontWeight: 600 }}
                title="Clear current cart"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: REGULAR SALE TAB                                                  */}
        {/* ========================================================================= */}
        {posMode === 'SALE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
            {/* Sale Search & Scanner Bar */}
            <div className="card" style={{ padding: '10px 12px' }}>
              <form 
                ref={saleSearchContainerRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  const currentVal = (saleInputRef.current?.value || saleSearchQuery).trim();
                  if (!currentVal) return;
                  const exactMatch = findMatchingVariant(currentVal);
                  if (exactMatch) {
                    addItemToCart(exactMatch, 'SALE');
                    setShowSaleDropdown(false);
                    setSaleSearchQuery('');
                  } else if (saleSearchResults.length === 1) {
                    addItemToCart(saleSearchResults[0], 'SALE');
                    setShowSaleDropdown(false);
                    setSaleSearchQuery('');
                  } else if (saleSearchResults.length === 0) {
                    showToast(`No product found for "${currentVal}"`, 'warning');
                  }
                }} 
                style={{ display: 'flex', gap: '8px', position: 'relative' }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    ref={saleInputRef}
                    type="text"
                    className="form-control"
                    placeholder="Scan barcode or type product name/SKU to sell... (Ctrl+F)"
                    value={saleSearchQuery}
                    onFocus={() => setShowSaleDropdown(true)}
                    onInput={(e) => {
                      const val = (e.currentTarget.value || '').trim();
                      if (!val) return;
                      const cleanVal = val.replace(/[^0-9a-zA-Z]/g, '');
                      if (cleanVal.length >= 4) {
                        const match = findMatchingVariant(cleanVal);
                        if (match) {
                          addItemToCart(match, 'SALE');
                          setShowSaleDropdown(false);
                          setSaleSearchQuery('');
                        }
                      }
                    }}
                    onChange={(e) => {
                      setSaleSearchQuery(e.target.value);
                      setShowSaleDropdown(true);
                    }}
                    style={{ paddingLeft: '36px', width: '100%', height: '38px', fontSize: '13px' }}
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ height: '38px', padding: '0 16px' }}>
                  Enter
                </button>

                {/* Dropdown for search results */}
                {showSaleDropdown && saleSearchResults.length > 0 && saleSearchQuery !== saleSearchResults[0].barcode && (
                  <div style={{
                    position: 'absolute',
                    top: '44px',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    zIndex: 9999,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                  }}>
                    {saleSearchResults.map(v => (
                      <div 
                        key={v.id} 
                        onClick={() => {
                          addItemToCart(v, 'SALE');
                          setShowSaleDropdown(false);
                          setSaleSearchQuery('');
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="search-item-row"
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{v.product?.name}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            SKU: {v.sku} | BC: {v.barcode}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 'bold', color: 'var(--color-primary)', fontSize: '13px' }}>
                            ৳{v.selling_price.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '10.5px', color: v.stock_quantity > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            Stock: {v.stock_quantity}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>

            {/* Sale Cart Table */}
            {/* Table Area */}
            <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '9px 14px', background: 'var(--color-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.4px' }}>
                  SALE ITEMS ({saleItems.length})
                </span>
              </div>

              {saleItems.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', flex: 1 }}>
                  Cart is empty. Scan barcode or search above.
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Item Details</th>
                          <th style={{ width: '130px', textAlign: 'center' }}>Price</th>
                          <th style={{ width: '105px', textAlign: 'center' }}>Qty</th>
                          <th style={{ width: '105px', textAlign: 'right' }}>Total</th>
                          <th style={{ width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {saleItems.map((item, idx) => {
                          const defaultPrice = item.variant.selling_price;
                          const itemPrice = item.customPrice !== undefined ? item.customPrice : defaultPrice;

                          return (
                            <tr key={'sale_' + item.variant.id + (item.saleType || 'SALE') + idx}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.variant.product?.name}</span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  SKU: {item.variant.sku} | BC: {item.variant.barcode}
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 600 }}>৳</span>
                                  <input
                                    type="number"
                                    className="form-control"
                                    value={itemPrice}
                                    onChange={(e) => updateCartPrice(item.variant.id, Number(e.target.value), item.saleType)}
                                    style={{ width: '75px', height: '28px', padding: '2px 4px', fontSize: '12.5px', textAlign: 'center' }}
                                  />
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                  <button 
                                    className="btn btn-secondary btn-sm" 
                                    style={{ width: '22px', height: '22px', padding: 0 }}
                                    onClick={() => updateCartQty(item.variant.id, item.quantity - 1, item.saleType)}
                                  >
                                    <Minus size={10} />
                                  </button>
                                  <span style={{ minWidth: '18px', fontWeight: 'bold', fontSize: '12.5px' }}>{item.quantity}</span>
                                  <button 
                                    className="btn btn-secondary btn-sm" 
                                    style={{ width: '22px', height: '22px', padding: 0 }}
                                    onClick={() => {
                                      if (item.quantity >= item.variant.stock_quantity) {
                                        showToast(`Warning: Only ${item.variant.stock_quantity} units available in stock.`, 'warning');
                                      }
                                      updateCartQty(item.variant.id, item.quantity + 1, item.saleType);
                                    }}
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: 'var(--color-primary)' }}>
                                ৳{(item.quantity * itemPrice).toFixed(2)}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button 
                                  className="btn btn-danger btn-sm" 
                                  style={{ width: '24px', height: '24px', padding: 0 }}
                                  onClick={() => removeFromCart(item.variant.id, item.saleType)}
                                  title="Remove from Cart"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom Summary Bar for Sale Cart Table */}
                  <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1.5px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Total Items: <strong style={{ color: 'var(--text-primary)' }}>{saleItems.reduce((acc, i) => acc + i.quantity, 0)} pcs</strong>
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary)' }}>
                      Subtotal: ৳{salesSubtotal.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RETURN & EXCHANGE TAB (2 SEPARATE TABLES: RETURN & EXCHANGE)       */}
        {/* ========================================================================= */}
        {posMode === 'RETURN' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '36px', flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
            
            {/* ------------------------------------------------------------- */}
            {/* TABLE 1 (TOP): RETURNED PRODUCTS (CREDIT)                     */}
            {/* ------------------------------------------------------------- */}
            <div style={{ border: '1.5px solid #e11d48', borderRadius: 'var(--radius-md)', background: '#fff', boxShadow: '0 3px 6px rgba(225, 29, 72, 0.08)', position: 'relative' }}>
              {/* Header */}
              <div style={{ padding: '9px 14px', background: '#be123c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '6px', borderTopRightRadius: '6px' }}>
                <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.4px' }}>
                  RETURNED ITEMS ({returnItems.length})
                </span>
              </div>

              {/* Dedicated Search / Scanner for Returned Products */}
              <div style={{ padding: '8px 12px', background: '#fff8f8', borderBottom: '1px solid #fee2e2' }}>
                <form 
                  ref={returnSearchContainerRef}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const currentVal = (returnInputRef.current?.value || returnSearchQuery).trim();
                    if (!currentVal) return;
                    const exactMatch = findMatchingVariant(currentVal);
                    if (exactMatch) {
                      addItemToCart(exactMatch, 'RETURN');
                      setShowReturnDropdown(false);
                      setReturnSearchQuery('');
                    } else if (returnSearchResults.length === 1) {
                      addItemToCart(returnSearchResults[0], 'RETURN');
                      setShowReturnDropdown(false);
                      setReturnSearchQuery('');
                    } else if (returnSearchResults.length === 0) {
                      showToast(`No product found for "${currentVal}"`, 'warning');
                    }
                  }} 
                  style={{ display: 'flex', gap: '8px', position: 'relative' }}
                >
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#e11d48' }} />
                    <input
                      ref={returnInputRef}
                      type="text"
                      className="form-control"
                      placeholder="Scan barcode or search return item..."
                      value={returnSearchQuery}
                      onFocus={() => setShowReturnDropdown(true)}
                      onInput={(e) => {
                        const val = (e.currentTarget.value || '').trim();
                        if (!val) return;
                        const cleanVal = val.replace(/[^0-9a-zA-Z]/g, '');
                        if (cleanVal.length >= 4) {
                          const match = findMatchingVariant(cleanVal);
                          if (match) {
                            addItemToCart(match, 'RETURN');
                            setShowReturnDropdown(false);
                            setReturnSearchQuery('');
                          }
                        }
                      }}
                      onChange={(e) => {
                        setReturnSearchQuery(e.target.value);
                        setShowReturnDropdown(true);
                      }}
                      style={{ paddingLeft: '32px', width: '100%', height: '34px', fontSize: '12.5px', borderColor: '#fca5a5' }}
                    />
                  </div>
                  <button type="submit" className="btn btn-danger" style={{ height: '34px', padding: '0 14px', fontSize: '12px', fontWeight: 700 }}>
                    + Return
                  </button>

                  {/* Dropdown for returned items search */}
                  {showReturnDropdown && returnSearchResults.length > 0 && returnSearchQuery !== returnSearchResults[0].barcode && (
                    <div style={{
                      position: 'absolute',
                      top: '38px',
                      left: 0,
                      right: 0,
                      backgroundColor: '#fff',
                      border: '1.5px solid #fda4af',
                      borderRadius: 'var(--radius-md)',
                      zIndex: 9999,
                      maxHeight: '260px',
                      overflowY: 'auto',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                    }}>
                      {returnSearchResults.map(v => (
                        <div 
                          key={v.id} 
                          onClick={() => {
                            addItemToCart(v, 'RETURN');
                            setShowReturnDropdown(false);
                            setReturnSearchQuery('');
                          }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          className="search-item-row"
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '12.5px' }}>{v.product?.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              SKU: {v.sku} | BC: {v.barcode}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', color: '#e11d48', fontSize: '12.5px' }}>
                              -৳{v.selling_price.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </div>

              {/* Table 1 Data */}
              {returnItems.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px', borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px' }}>
                  No returned items added yet.
                </div>
              ) : (
                <>
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#fff1f2' }}>
                        <th style={{ color: '#9f1239' }}>Item Details</th>
                        <th style={{ width: '85px', textAlign: 'center', color: '#9f1239' }}>Unit Price</th>
                        <th style={{ width: '130px', textAlign: 'center', color: '#9f1239' }}>Discount</th>
                        <th style={{ width: '95px', textAlign: 'center', color: '#9f1239' }}>Credit Price</th>
                        <th style={{ width: '105px', textAlign: 'center', color: '#9f1239' }}>Qty</th>
                        <th style={{ width: '100px', textAlign: 'right', color: '#9f1239' }}>Credit Total</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnItems.map((item, idx) => {
                        const origPrice = item.variant.selling_price;
                        const itemPrice = item.customPrice !== undefined ? item.customPrice : origPrice;
                        const itemDiscount = Math.max(0, origPrice - itemPrice);

                        return (
                          <tr key={'ret_' + item.variant.id + idx} style={{ backgroundColor: '#fff7f8' }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{item.variant.product?.name}</span>
                                <span style={{ backgroundColor: '#fee2e2', color: '#e11d48', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 800 }}>
                                  RETURN
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                SKU: {item.variant.sku} | BC: {item.variant.barcode}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              ৳{origPrice.toFixed(0)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>৳</span>
                                  <input
                                    type="number"
                                    className="form-control"
                                    value={itemDiscount || ''}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const disc = Number(e.target.value) || 0;
                                      updateCartPrice(item.variant.id, Math.max(0, origPrice - disc), 'RETURN');
                                    }}
                                    style={{ width: '60px', height: '24px', padding: '1px 4px', fontSize: '11.5px', textAlign: 'center', borderColor: '#fecdd3' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateCartPrice(item.variant.id, Math.round(origPrice * 0.85), 'RETURN')}
                                    style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 700, borderRadius: '3px', border: '1px solid #fecdd3', background: itemDiscount === Math.round(origPrice * 0.15) && itemDiscount > 0 ? '#e11d48' : '#fff', color: itemDiscount === Math.round(origPrice * 0.15) && itemDiscount > 0 ? '#fff' : '#e11d48', cursor: 'pointer' }}
                                  >
                                    15%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateCartPrice(item.variant.id, Math.round(origPrice * 0.90), 'RETURN')}
                                    style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 700, borderRadius: '3px', border: '1px solid #e5e7eb', background: itemDiscount === Math.round(origPrice * 0.10) && itemDiscount > 0 ? '#4b5563' : '#fff', color: itemDiscount === Math.round(origPrice * 0.10) && itemDiscount > 0 ? '#fff' : '#4b5563', cursor: 'pointer' }}
                                  >
                                    10%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateCartPrice(item.variant.id, Math.round(origPrice * 0.80), 'RETURN')}
                                    style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 700, borderRadius: '3px', border: '1px solid #e5e7eb', background: itemDiscount === Math.round(origPrice * 0.20) && itemDiscount > 0 ? '#4b5563' : '#fff', color: itemDiscount === Math.round(origPrice * 0.20) && itemDiscount > 0 ? '#fff' : '#4b5563', cursor: 'pointer' }}
                                  >
                                    20%
                                  </button>
                                  {itemDiscount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => updateCartPrice(item.variant.id, origPrice, 'RETURN')}
                                      style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 600, borderRadius: '3px', border: '1px solid #d1d5db', background: '#f3f4f6', color: '#6b7280', cursor: 'pointer' }}
                                      title="Clear Discount"
                                    >
                                      0
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#e11d48' }}>-৳</span>
                                <input
                                  type="number"
                                  className="form-control"
                                  value={itemPrice}
                                  onChange={(e) => updateCartPrice(item.variant.id, Number(e.target.value), 'RETURN')}
                                  style={{ width: '68px', height: '26px', padding: '2px 4px', fontSize: '12px', textAlign: 'center', color: '#e11d48', fontWeight: 700, borderColor: '#fecdd3' }}
                                />
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  style={{ width: '22px', height: '22px', padding: 0 }}
                                  onClick={() => updateCartQty(item.variant.id, item.quantity - 1, 'RETURN')}
                                >
                                  <Minus size={10} />
                                </button>
                                <span style={{ minWidth: '18px', fontWeight: 'bold', fontSize: '12.5px' }}>{item.quantity}</span>
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  style={{ width: '22px', height: '22px', padding: 0 }}
                                  onClick={() => updateCartQty(item.variant.id, item.quantity + 1, 'RETURN')}
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#e11d48' }}>
                              -৳{(item.quantity * itemPrice).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="btn btn-danger btn-sm" 
                                style={{ width: '24px', height: '24px', padding: 0 }}
                                onClick={() => removeFromCart(item.variant.id, 'RETURN')}
                                title="Remove item"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Bottom Summary Bar for Return Table */}
                  <div style={{ padding: '10px 16px', background: '#fff1f2', borderTop: '1.5px solid #fecdd3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px' }}>
                    <span style={{ fontSize: '12.5px', color: '#9f1239', fontWeight: 600 }}>
                      Total Items: <strong style={{ color: '#881337' }}>{returnItems.reduce((acc, i) => acc + i.quantity, 0)} pcs</strong>
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#e11d48' }}>
                      Return Credit: -৳{returnsTotal.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* TABLE 2 (BOTTOM): SALE PRODUCTS                               */}
            {/* ------------------------------------------------------------- */}
            <div style={{ border: '1.5px solid #2563eb', borderRadius: 'var(--radius-md)', background: '#fff', boxShadow: '0 3px 6px rgba(37, 99, 235, 0.08)', position: 'relative' }}>
              {/* Header */}
              <div style={{ padding: '9px 14px', background: '#1d4ed8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '6px', borderTopRightRadius: '6px' }}>
                <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.4px' }}>
                  SALE ITEMS ({saleItems.length})
                </span>
              </div>

              {/* Dedicated Search / Scanner for Sale Products */}
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <form 
                  ref={exchangeSearchContainerRef}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const currentVal = (exchangeInputRef.current?.value || exchangeSearchQuery).trim();
                    if (!currentVal) return;
                    const exactMatch = findMatchingVariant(currentVal);
                    if (exactMatch) {
                      addItemToCart(exactMatch, 'SALE');
                      setShowExchangeDropdown(false);
                      setExchangeSearchQuery('');
                    } else if (exchangeSearchResults.length === 1) {
                      addItemToCart(exchangeSearchResults[0], 'SALE');
                      setShowExchangeDropdown(false);
                      setExchangeSearchQuery('');
                    } else if (exchangeSearchResults.length === 0) {
                      showToast(`No product found for "${currentVal}"`, 'warning');
                    }
                  }} 
                  style={{ display: 'flex', gap: '8px', position: 'relative' }}
                >
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#2563eb' }} />
                    <input
                      ref={exchangeInputRef}
                      type="text"
                      className="form-control"
                      placeholder="Scan barcode or search sale item..."
                      value={exchangeSearchQuery}
                      onFocus={() => setShowExchangeDropdown(true)}
                      onInput={(e) => {
                        const val = (e.currentTarget.value || '').trim();
                        if (!val) return;
                        const cleanVal = val.replace(/[^0-9a-zA-Z]/g, '');
                        if (cleanVal.length >= 4) {
                          const match = findMatchingVariant(cleanVal);
                          if (match) {
                            addItemToCart(match, 'SALE');
                            setShowExchangeDropdown(false);
                            setExchangeSearchQuery('');
                          }
                        }
                      }}
                      onChange={(e) => {
                        setExchangeSearchQuery(e.target.value);
                        setShowExchangeDropdown(true);
                      }}
                      style={{ paddingLeft: '32px', width: '100%', height: '34px', fontSize: '12.5px', borderColor: '#93c5fd' }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ height: '34px', padding: '0 14px', fontSize: '12px', fontWeight: 700, background: '#2563eb' }}>
                    + Sale Item
                  </button>

                  {/* Dropdown for exchange items search */}
                  {showExchangeDropdown && exchangeSearchResults.length > 0 && exchangeSearchQuery !== exchangeSearchResults[0].barcode && (
                    <div style={{
                      position: 'absolute',
                      top: '38px',
                      left: 0,
                      right: 0,
                      backgroundColor: '#fff',
                      border: '1.5px solid #93c5fd',
                      borderRadius: 'var(--radius-md)',
                      zIndex: 9999,
                      maxHeight: '260px',
                      overflowY: 'auto',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                    }}>
                      {exchangeSearchResults.map(v => (
                        <div 
                          key={v.id} 
                          onClick={() => {
                            addItemToCart(v, 'SALE');
                            setShowExchangeDropdown(false);
                            setExchangeSearchQuery('');
                          }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eff6ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          className="search-item-row"
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '12.5px' }}>{v.product?.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              SKU: {v.sku} | BC: {v.barcode}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', color: '#2563eb', fontSize: '12.5px' }}>
                              ৳{v.selling_price.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '10.5px', color: v.stock_quantity > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              Stock: {v.stock_quantity}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </div>

              {/* Table 2 Data */}
              {saleItems.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px', borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px' }}>
                  No sale items added.
                </div>
              ) : (
                <>
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#eff6ff' }}>
                        <th style={{ color: '#1e40af' }}>Item Details</th>
                        <th style={{ width: '85px', textAlign: 'center', color: '#1e40af' }}>Unit Price</th>
                        <th style={{ width: '130px', textAlign: 'center', color: '#1e40af' }}>Discount</th>
                        <th style={{ width: '95px', textAlign: 'center', color: '#1e40af' }}>Price</th>
                        <th style={{ width: '105px', textAlign: 'center', color: '#1e40af' }}>Qty</th>
                        <th style={{ width: '100px', textAlign: 'right', color: '#1e40af' }}>Total</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {saleItems.map((item, idx) => {
                        const origPrice = item.variant.selling_price;
                        const itemPrice = item.customPrice !== undefined ? item.customPrice : origPrice;
                        const itemDiscount = Math.max(0, origPrice - itemPrice);

                        return (
                          <tr key={'exch_' + item.variant.id + idx}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.variant.product?.name}</span>
                                <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 800 }}>
                                  SALE
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                SKU: {item.variant.sku} | BC: {item.variant.barcode}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              ৳{origPrice.toFixed(0)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>৳</span>
                                  <input
                                    type="number"
                                    className="form-control"
                                    value={itemDiscount || ''}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const disc = Number(e.target.value) || 0;
                                      updateCartPrice(item.variant.id, Math.max(0, origPrice - disc), item.saleType);
                                    }}
                                    style={{ width: '60px', height: '24px', padding: '1px 4px', fontSize: '11.5px', textAlign: 'center', borderColor: '#bfdbfe' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateCartPrice(item.variant.id, Math.round(origPrice * 0.85), item.saleType)}
                                    style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 700, borderRadius: '3px', border: '1px solid #bfdbfe', background: itemDiscount === Math.round(origPrice * 0.15) && itemDiscount > 0 ? '#2563eb' : '#fff', color: itemDiscount === Math.round(origPrice * 0.15) && itemDiscount > 0 ? '#fff' : '#2563eb', cursor: 'pointer' }}
                                  >
                                    15%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateCartPrice(item.variant.id, Math.round(origPrice * 0.90), item.saleType)}
                                    style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 700, borderRadius: '3px', border: '1px solid #e5e7eb', background: itemDiscount === Math.round(origPrice * 0.10) && itemDiscount > 0 ? '#4b5563' : '#fff', color: itemDiscount === Math.round(origPrice * 0.10) && itemDiscount > 0 ? '#fff' : '#4b5563', cursor: 'pointer' }}
                                  >
                                    10%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateCartPrice(item.variant.id, Math.round(origPrice * 0.80), item.saleType)}
                                    style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 700, borderRadius: '3px', border: '1px solid #e5e7eb', background: itemDiscount === Math.round(origPrice * 0.20) && itemDiscount > 0 ? '#4b5563' : '#fff', color: itemDiscount === Math.round(origPrice * 0.20) && itemDiscount > 0 ? '#fff' : '#4b5563', cursor: 'pointer' }}
                                  >
                                    20%
                                  </button>
                                  {itemDiscount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => updateCartPrice(item.variant.id, origPrice, item.saleType)}
                                      style={{ padding: '1px 3px', fontSize: '9px', fontWeight: 600, borderRadius: '3px', border: '1px solid #d1d5db', background: '#f3f4f6', color: '#6b7280', cursor: 'pointer' }}
                                      title="Clear Discount"
                                    >
                                      0
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600 }}>৳</span>
                                <input
                                  type="number"
                                  className="form-control"
                                  value={itemPrice}
                                  onChange={(e) => updateCartPrice(item.variant.id, Number(e.target.value), item.saleType)}
                                  style={{ width: '68px', height: '26px', padding: '2px 4px', fontSize: '12px', textAlign: 'center' }}
                                />
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  style={{ width: '22px', height: '22px', padding: 0 }}
                                  onClick={() => updateCartQty(item.variant.id, item.quantity - 1, item.saleType)}
                                >
                                  <Minus size={10} />
                                </button>
                                <span style={{ minWidth: '18px', fontWeight: 'bold', fontSize: '12.5px' }}>{item.quantity}</span>
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  style={{ width: '22px', height: '22px', padding: 0 }}
                                  onClick={() => {
                                    if (item.quantity >= item.variant.stock_quantity) {
                                      showToast(`Warning: Only ${item.variant.stock_quantity} units available in stock.`, 'warning');
                                    }
                                    updateCartQty(item.variant.id, item.quantity + 1, item.saleType);
                                  }}
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#2563eb' }}>
                              ৳{(item.quantity * itemPrice).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="btn btn-danger btn-sm" 
                                style={{ width: '24px', height: '24px', padding: 0 }}
                                onClick={() => removeFromCart(item.variant.id, item.saleType)}
                                title="Remove item"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Bottom Summary Bar for Sale Table */}
                  <div style={{ padding: '10px 16px', background: '#eff6ff', borderTop: '1.5px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px' }}>
                    <span style={{ fontSize: '12.5px', color: '#1e40af', fontWeight: 600 }}>
                      Total Items: <strong style={{ color: '#172554' }}>{saleItems.reduce((acc, i) => acc + i.quantity, 0)} pcs</strong>
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#2563eb' }}>
                      Sale Subtotal: ৳{salesSubtotal.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>

          </div>
        )}
      </div>

      {/* RIGHT: Checkout Sidebar */}
      <div className="pos-sidebar">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Summary</span>
          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: posMode === 'RETURN' ? '#fff1f2' : 'var(--bg-primary)', color: posMode === 'RETURN' ? '#e11d48' : 'var(--color-primary)', fontWeight: 700 }}>
            {posMode === 'RETURN' ? 'Return / Exchange' : 'Sale'}
          </span>
        </div>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          
          {/* Subtotal Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12.5px', background: '#f8fafc', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            {posMode === 'RETURN' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e11d48' }}>
                  <span style={{ fontWeight: 700 }}>Returned Credit:</span>
                  <span style={{ fontWeight: 800 }}>-৳{returnsTotal.toFixed(2)}</span>
                </div>
                {saleItems.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2563eb' }}>
                    <span style={{ fontWeight: 700 }}>Exchange Total:</span>
                    <span style={{ fontWeight: 800 }}>+৳{salesSubtotal.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '5px', marginTop: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Net Total:</span>
                  <span style={{ fontWeight: 800, color: netSubtotal < 0 ? '#e11d48' : netSubtotal > 0 ? 'var(--color-primary)' : '#059669' }}>
                    {netSubtotal < 0 ? `-৳${Math.abs(netSubtotal).toFixed(2)}` : `৳${netSubtotal.toFixed(2)}`}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Cart Subtotal:</span>
                <span style={{ fontWeight: 700 }}>৳{salesSubtotal.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Customer Details Section */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            marginBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                👤 Customer Information
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '11px', marginBottom: '2px' }}>Customer Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={customerName} 
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  style={{ height: '32px', fontSize: '12px' }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '11px', marginBottom: '2px' }}>Customer Phone</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={customerPhone} 
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  style={{ height: '32px', fontSize: '12px' }}
                />
              </div>
            </div>
          </div>

          {/* Discount Section (Only when customer is making a purchase/exchange) */}
          {(!isPureReturn) && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0 }}>Discount (৳ / %)</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setDiscount(Math.round(Math.max(0, netSubtotal) * 0.15))}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '2px 6px',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      backgroundColor: discount === Math.round(Math.max(0, netSubtotal) * 0.15) && discount > 0 ? '#ffe4e6' : 'var(--bg-primary)',
                      color: discount === Math.round(Math.max(0, netSubtotal) * 0.15) && discount > 0 ? '#e11d48' : 'var(--color-primary)',
                      borderColor: discount === Math.round(Math.max(0, netSubtotal) * 0.15) && discount > 0 ? '#fda4af' : 'var(--border-color)',
                    }}
                    title="Apply 15% Opening Discount"
                  >
                    🎉 15% Off
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscount(Math.round(Math.max(0, netSubtotal) * 0.10))}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10.5px', fontWeight: 700 }}
                  >
                    10%
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscount(Math.round(Math.max(0, netSubtotal) * 0.20))}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10.5px', fontWeight: 700 }}
                  >
                    20%
                  </button>
                  {discount > 0 && (
                    <button
                      type="button"
                      onClick={() => setDiscount(0)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 6px', fontSize: '10.5px', color: 'var(--color-danger)' }}
                      title="Clear Discount"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '12px' }}>৳</span>
                <input 
                  type="number" 
                  className="form-control" 
                  value={discount || ''} 
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  placeholder="0.00"
                  style={{ paddingLeft: '22px' }}
                />
              </div>
              {discount > 0 && netSubtotal > 0 && (
                <div style={{ fontSize: '11px', color: '#e11d48', fontWeight: 700, marginTop: '3px', textAlign: 'right' }}>
                  Applied: {((discount / netSubtotal) * 100).toFixed(1)}% OFF (-৳{discount.toFixed(2)})
                </div>
              )}
            </div>
          )}

          {/* Settlement Banner: Net Payable OR Cash Refund OR Even Exchange */}
          {isRefund ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '10px 14px', 
              background: '#fff1f2', 
              border: '1.5px solid #fecdd3',
              borderRadius: 'var(--radius-sm)' 
            }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#9f1239' }}>Cash Refund:</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#e11d48' }}>
                ৳{refundAmount.toFixed(2)}
              </span>
            </div>
          ) : isEvenExchange ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '10px 14px', 
              background: '#ecfdf5', 
              border: '1.5px solid #a7f3d0',
              borderRadius: 'var(--radius-sm)' 
            }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#065f46' }}>Even Exchange:</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#059669' }}>
                ৳0.00
              </span>
            </div>
          ) : (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '10px 14px', 
              background: 'var(--color-primary-light)', 
              border: '1px solid rgba(11, 37, 69, 0.1)',
              borderRadius: 'var(--radius-sm)' 
            }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)' }}>Total Payable:</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-primary)' }}>
                ৳{payableAmount.toFixed(2)}
              </span>
            </div>
          )}

          {/* Payment Method Section (Only when customer owes money) */}
          {!isRefund && !isEvenExchange && (
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Payment Method</label>

              {/* Method pill toggles */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {[
                  { label: 'Cash', value: 'CASH',   bg: '#16a34a', light: 'rgba(22,163,74,0.1)',   text: '#fff', icon: '💵' },
                  { label: 'Card', value: 'CARD',   bg: '#2563eb', light: 'rgba(37,99,235,0.1)',   text: '#fff', icon: '💳' },
                  { label: 'bKash', value: 'BKASH', bg: '#e2136e', light: 'rgba(226,19,110,0.1)', text: '#fff', icon: '🅱' },
                  { label: 'Nagad', value: 'NAGAD', bg: '#f97316', light: 'rgba(249,115,22,0.1)', text: '#fff', icon: '🅽' },
                  { label: 'Rocket', value: 'ROCKET', bg: '#7c3aed', light: 'rgba(124,58,237,0.1)', text: '#fff', icon: '🚀' },
                ].map(opt => {
                  const isActive = paymentRows.some(r => r.method === opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          if (paymentRows.length > 1) removePaymentRow(paymentRows.findIndex(r => r.method === opt.value));
                          else updatePaymentRow(0, 'method', opt.value);
                        } else {
                          if (paymentRows.length === 1 && paymentRows[0].amount === 0) {
                            updatePaymentRow(0, 'method', opt.value);
                          } else {
                            setPaymentRows(prev => [...prev, { method: opt.value, amount: 0 }]);
                          }
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '16px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: isActive ? `1.5px solid ${opt.bg}` : '1px solid var(--border-color)',
                        background: isActive ? opt.bg : opt.light,
                        color: isActive ? opt.text : opt.bg,
                        transition: 'all 0.12s',
                      }}
                    >
                      <span>{opt.icon}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Amount inputs for active methods */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {paymentRows.map((row, idx) => {
                  const meta: Record<string, { label: string; color: string }> = {
                    CASH:   { label: 'Cash',   color: '#16a34a' },
                    CARD:   { label: 'Card',   color: '#2563eb' },
                    BKASH:  { label: 'bKash',  color: '#e2136e' },
                    NAGAD:  { label: 'Nagad',  color: '#f97316' },
                    ROCKET: { label: 'Rocket', color: '#7c3aed' },
                  };
                  const m = meta[row.method] || { label: row.method, color: 'var(--color-primary)' };
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{
                        width: '50px', flexShrink: 0, fontSize: '11.5px', fontWeight: 700,
                        color: m.color, textAlign: 'right'
                      }}>{m.label}</span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '12px' }}>৳</span>
                        <input
                          type="number"
                          className="form-control"
                          value={row.amount || ''}
                          onChange={e => updatePaymentRow(idx, 'amount', Number(e.target.value))}
                          placeholder="0.00"
                          style={{ paddingLeft: '22px', fontSize: '13px', fontWeight: 700, height: '32px', borderColor: m.color + '60' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => fillRemaining(idx)}
                        title="Fill remaining"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0 8px', height: '32px', fontSize: '11px', fontWeight: 700, color: m.color, flexShrink: 0 }}
                      >
                        Fill
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary Calculation */}
          {!isRefund && !isEvenExchange && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Received</span>
                <span style={{ fontWeight: 700 }}>৳{totalReceived.toFixed(2)}</span>
              </div>
              {changeAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Change to Return</span>
                  <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '13px' }}>৳{changeAmount.toFixed(2)}</span>
                </div>
              )}
              {dueAmount > 0 && totalReceived > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Customer Due</span>
                  <span style={{ color: 'var(--color-danger)', fontWeight: 700, fontSize: '13px' }}>৳{dueAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Auto Print Setting & Quick Key Reminder */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-secondary)', padding: '2px 4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={e => toggleAutoPrint(e.target.checked)}
                style={{ width: '14px', height: '14px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
              />
              <span>⚡ Auto-Print Receipt</span>
            </label>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
              [F2 / Ctrl+Enter]
            </span>
          </div>

          {/* Action Checkout Button */}
          <button
            onClick={handleCheckout}
            className={isRefund ? "btn btn-danger" : isEvenExchange ? "btn btn-success" : "btn btn-primary"}
            style={{ 
              width: '100%', 
              padding: '10px 14px', 
              height: '42px', 
              borderRadius: 'var(--radius-sm)', 
              fontSize: '14px', 
              fontWeight: 800, 
              marginTop: '2px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '8px',
              backgroundColor: isEvenExchange ? '#059669' : undefined
            }}
            disabled={cart.length === 0 || checkingOut}
          >
            {checkingOut ? (
              'Processing...'
            ) : isPureReturn ? (
              <>
                <RotateCcw size={16} />
                Complete Return &amp; Refund ৳{refundAmount.toFixed(2)}
              </>
            ) : isRefund ? (
              <>
                <RotateCcw size={16} />
                Complete Exchange &amp; Refund ৳{refundAmount.toFixed(2)}
              </>
            ) : isEvenExchange ? (
              <>
                <ArrowLeftRight size={16} />
                Complete Even Exchange (৳0.00)
              </>
            ) : isExchange ? (
              <>
                <CheckCircle2 size={16} />
                Complete Exchange &amp; Pay ৳{payableAmount.toFixed(2)}
              </>
            ) : (
              <>
                <Printer size={16} />
                Complete &amp; Checkout (F2)
              </>
            )}
          </button>
        </div>
      </div>

      {/* 58mm THERMAL RECEIPT MODAL */}
      {showReceipt && lastCompletedInvoice && (
        <InvoicePrintModal
          data={lastCompletedInvoice}
          onClose={() => {
            setShowReceipt(false);
            handleNewSale();
          }}
          onNewSale={() => {
            setShowReceipt(false);
            handleNewSale();
          }}
        />
      )}
    </div>
  );
};
