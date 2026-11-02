import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import type { ProductVariant } from '../store';
import { useNotificationStore } from '../store';
import { Plus, Truck } from 'lucide-react';
import { Pagination } from './Pagination';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface PurchasesViewProps {
  onRefreshStats: () => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ onRefreshStats }) => {
  const { showToast } = useNotificationStore();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create Purchase workflow states
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState<{ variantId: string; quantity: number; unitCost: number; name: string }[]>([]);

  // Scanner lookup inside purchase modal
  const [scanQuery, setScanQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Create Supplier modal states
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');

  const loadData = async () => {
    const [purchList, supList, varList] = await Promise.all([
      dbService.getPurchases(),
      dbService.getSuppliers(),
      dbService.getVariants()
    ]);
    setPurchases(purchList);
    setSuppliers(supList);
    setVariants(varList);
    if (supList.length > 0) setSelectedSupplierId(supList[0].id);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    const sup = await dbService.saveSupplier({ name: supName, contact_person: supContact, phone: supPhone });
    setSuppliers(prev => [...prev, sup]);
    setSelectedSupplierId(sup.id);
    setShowSupplierModal(false);
    setSupName('');
    setSupContact('');
    setSupPhone('');
  };

  const handleScanOrSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanQuery.trim()) return;

    // Search exact or unhyphenated barcode
    const qClean = scanQuery.trim().replace(/[\s-]/g, '').toLowerCase();
    const match = variants.find(v => {
      if (!v.barcode) return false;
      const bc = v.barcode.trim().toLowerCase();
      return bc === scanQuery.trim().toLowerCase() || bc.replace(/[\s-]/g, '') === qClean;
    });
    if (match) {
      addItemToPurchase(match);
      setScanQuery('');
    } else {
      // search SKU or Product Name partially
      const partial = variants.filter(v =>
        v.sku.toLowerCase().includes(scanQuery.toLowerCase()) ||
        v.product?.name.toLowerCase().includes(scanQuery.toLowerCase())
      );
      if (partial.length === 1) {
        addItemToPurchase(partial[0]);
        setScanQuery('');
      } else if (partial.length > 1) {
        showToast(`Multiple products matched (${partial.length}). Please scan exact barcode or enter unique SKU.`, 'warning');
      } else {
        showToast('No matching product found.', 'warning');
      }
    }
  };

  const filteredSuggestions = variants.filter(v =>
    scanQuery.trim() === '' ||
    v.barcode?.toLowerCase().includes(scanQuery.toLowerCase()) ||
    v.sku?.toLowerCase().includes(scanQuery.toLowerCase()) ||
    v.product?.name?.toLowerCase().includes(scanQuery.toLowerCase())
  );

  const addItemToPurchase = (v: ProductVariant) => {
    const existingIndex = purchaseItems.findIndex(item => item.variantId === v.id);
    if (existingIndex > -1) {
      const updated = [...purchaseItems];
      updated[existingIndex].quantity += 1;
      setPurchaseItems(updated);
    } else {
      setPurchaseItems([...purchaseItems, {
        variantId: v.id,
        quantity: 1,
        unitCost: v.purchase_price,
        name: v.product?.name || 'Product'
      }]);
    }
  };

  const updateItemQty = (index: number, val: number) => {
    const updated = [...purchaseItems];
    updated[index].quantity = Math.max(1, val);
    setPurchaseItems(updated);
  };

  const updateItemCost = (index: number, val: number) => {
    const updated = [...purchaseItems];
    updated[index].unitCost = Math.max(0, val);
    setPurchaseItems(updated);
  };

  const removeItem = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  const handleSubmitPurchase = async () => {
    if (!selectedSupplierId || !invoiceNumber.trim() || purchaseItems.length === 0) {
      showToast('Please fill in supplier, invoice number, and add at least one product.', 'warning');
      return;
    }

    try {
      setSavingPurchase(true);
      showToast('Logging supplier purchase...', 'info');
      await dbService.addPurchase(selectedSupplierId, purchaseItems, invoiceNumber, shippingCost);
      setShowAddModal(false);
      setInvoiceNumber('');
      setShippingCost(0);
      setPurchaseItems([]);
      await loadData();
      onRefreshStats();
      showToast('Purchase stock logged successfully!', 'success');
    } catch (err: any) {
      console.error('Error logging purchase:', err);
      showToast(err?.message || 'Error logging purchase', 'error');
    } finally {
      setSavingPurchase(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Self-contained CSS for Purchases Responsiveness */}
      <style>{`
        .purchase-form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 768px) {
          .purchase-modal-card {
            width: 95% !important;
            padding: 18px !important;
            max-height: 95vh !important;
          }
          .purchase-form-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (suppliers.length > 0 && !selectedSupplierId) {
              setSelectedSupplierId(suppliers[0].id);
            }
            setShowAddModal(true);
          }}
        >
          <Plus size={18} /> Create Purchase
        </button>
      </div>

      {/* History table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
              <th>Purchase Date</th>
              <th>Supplier</th>
              <th>Invoice #</th>
              <th>Shipping Cost</th>
              <th>Total Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                  No purchase history available. Restock items to log supplier data.
                </td>
              </tr>
            ) : (
              purchases
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((p, idx) => (
                  <tr key={p.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {(currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td>{formatDateDDMMYYYY(p.purchase_date)}</td>
                    <td>{p.supplier?.name || 'Unknown Supplier'}</td>
                    <td style={{ fontWeight: 'bold' }}>{p.invoice_number}</td>
                    <td>৳{(p.shipping_cost || 0).toFixed(2)}</td>
                    <td>৳{p.total_amount.toFixed(2)}</td>
                    <td>
                      <span style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--color-success)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
        <Pagination
          currentPage={currentPage}
          totalItems={purchases.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* LOG PURCHASE ORDER MODAL */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '12px' }}>
          <div className="card purchase-modal-card" style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '92vh', overflowY: 'auto', padding: '18px' }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Truck size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Log Supplier Restock
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Add restock items, set quantities and cost prices, then receive stock
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1, padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    className="form-control"
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '0 8px' }} onClick={() => setShowSupplierModal(true)} title="Add New Supplier">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Invoice / Bill # *</label>
                <input
                  type="text"
                  className="form-control"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-1002"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Shipping Cost (৳)</label>
                <input
                  type="number"
                  className="form-control"
                  value={shippingCost || ''}
                  onChange={e => setShippingCost(Math.max(0, Number(e.target.value)))}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Scanning tool */}
            <div className="form-group" style={{ position: 'relative' }}>
              <form onSubmit={handleScanOrSearch}>
                <label className="form-label">Search Product to Restock</label>
                <input
                  type="text"
                  className="form-control"
                  value={scanQuery}
                  onChange={e => { setScanQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                  placeholder="Scan barcode or type name/SKU..."
                  autoComplete="off"
                />
              </form>
              {showSuggestions && (
                <div style={{
                  position: 'absolute',
                  top: '60px',
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'white',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  boxShadow: 'var(--shadow-lg)'
                }}>
                  {filteredSuggestions.length === 0 ? (
                    <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>No products found</div>
                  ) : (
                    filteredSuggestions.map(v => (
                      <div
                        key={v.id}
                        onMouseDown={() => {
                          addItemToPurchase(v);
                          setScanQuery('');
                          setShowSuggestions(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                      >
                        <div>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {v.product?.name}
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                            SKU: {v.sku}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '11.5px', flexShrink: 0, marginLeft: '10px' }}>
                          <div style={{ color: 'var(--color-primary)', fontWeight: 600 }}>৳{v.purchase_price}</div>
                          <div style={{ color: 'var(--text-muted)' }}>{v.barcode}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Added list */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Items to Restock ({purchaseItems.length})</span>
              </div>
              <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product Details</th>
                      <th style={{ width: '90px' }}>Quantity</th>
                      <th style={{ width: '100px' }}>Cost Price (৳)</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          No items added yet. Search or scan barcode above to add.
                        </td>
                      </tr>
                    ) : (
                      purchaseItems.map((item, idx) => (
                        <tr key={item.variantId}>
                          <td style={{ fontWeight: 600, fontSize: '12.5px' }}>{item.name}</td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              value={item.quantity}
                              onChange={e => updateItemQty(idx, Number(e.target.value))}
                              style={{ width: '70px', height: '28px', padding: '2px 4px', textAlign: 'center' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              value={item.unitCost}
                              onChange={e => updateItemCost(idx, Number(e.target.value))}
                              style={{ width: '85px', height: '28px', padding: '2px 4px', textAlign: 'center' }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn btn-danger btn-sm" style={{ width: '24px', height: '24px', padding: 0 }} onClick={() => removeItem(idx)}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '4px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Total Bill:</span>{' '}
                <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--color-primary)' }}>
                  ৳{(purchaseItems.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0) + shippingCost).toFixed(2)}
                </span>
                {shippingCost > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    (+৳{shippingCost.toFixed(2)} ship)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSubmitPurchase} disabled={purchaseItems.length === 0 || savingPurchase}>
                  {savingPurchase ? 'Receiving...' : 'Receive Stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD SUPPLIER MODAL */}
      {showSupplierModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '12px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '380px', padding: '18px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 800 }}>Add New Supplier</h3>
            <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Supplier Name *</label>
                <input type="text" className="form-control" value={supName} onChange={e => setSupName(e.target.value)} required placeholder="e.g. Dhaka Fabrics Ltd" />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Person</label>
                <input type="text" className="form-control" value={supContact} onChange={e => setSupContact(e.target.value)} placeholder="e.g. Mr. Kabir" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="text" className="form-control" value={supPhone} onChange={e => setSupPhone(e.target.value)} placeholder="e.g. 01712345678" />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSupplierModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
