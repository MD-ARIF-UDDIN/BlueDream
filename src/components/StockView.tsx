import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import type { ProductVariant } from '../store';
import { AlertTriangle, List, ArrowDownUp, SlidersHorizontal, Search, X, FileDown } from 'lucide-react';
import { Pagination } from './Pagination';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { exportTableToPdf } from '../utils/pdfExport';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isAdminRole } from '../roleUtils';

interface StockViewProps {
  onRefreshStats?: () => void;
  userRole?: string;
}

export const StockView: React.FC<StockViewProps> = ({ onRefreshStats, userRole }) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'ledger'>('inventory');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState(10);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);

  // Manual Stock Adjustment Modal State
  const [adjustingVariant, setAdjustingVariant] = useState<ProductVariant | null>(null);
  const [showGeneralAdjustModal, setShowGeneralAdjustModal] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [varList, ledgerList] = await Promise.all([
        dbService.getVariants(),
        dbService.getStockLedger()
      ]);

      setVariants(varList);
      setLedger(ledgerList);
    } catch (e) {
      console.error('Failed to load inventory audits', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const lowStockItems = variants.filter(v => v.stock_quantity <= v.min_stock_level);

  // Filtered variants based on search (Supports Product Name, SKU, Barcode)
  const filteredVariants = variants.filter(v => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const rawQ = q.replace(/-/g, '');
    const bc = (v.barcode || '').toLowerCase();
    const rawBc = bc.replace(/-/g, '');

    return (
      v.product?.name.toLowerCase().includes(q) ||
      v.sku.toLowerCase().includes(q) ||
      bc.includes(q) ||
      rawBc.includes(rawQ)
    );
  });

  const openAdjustModal = (variant?: ProductVariant) => {
    if (variant) {
      setAdjustingVariant(variant);
    } else {
      setShowGeneralAdjustModal(true);
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading inventory audit reports...</div>;

  const handleDownloadPdf = () => {
    if (activeTab === 'inventory') {
      const totalUnits = filteredVariants.reduce((acc, v) => acc + (v.stock_quantity || 0), 0);
      const totalValuation = filteredVariants.reduce((acc, v) => acc + ((v.stock_quantity || 0) * (v.purchase_price || 0)), 0);

      exportTableToPdf({
        moduleName: 'Stock Valuation',
        title: 'Inventory Stock Levels & Valuation Report',
        summaryCards: [
          { label: 'Total Variants', value: String(filteredVariants.length) },
          { label: 'Total Stock Units', value: `${totalUnits} pcs` },
          { label: 'Total Stock Valuation', value: `Tk ${totalValuation.toFixed(2)}` },
          { label: 'Low Stock Items', value: `${lowStockItems.length} items` }
        ],
        columns: [
          { header: 'Product Name', key: 'product', format: (_, row) => row.product?.name || '-' },
          { header: 'SKU', key: 'sku' },
          { header: 'Barcode', key: 'barcode' },
          { header: 'Purchase Price', key: 'purchase_price', align: 'right', format: (v) => `Tk ${Number(v || 0).toFixed(2)}` },
          { header: 'Selling Price', key: 'selling_price', align: 'right', format: (v) => `Tk ${Number(v || 0).toFixed(2)}` },
          { header: 'Stock Qty', key: 'stock_quantity', align: 'center', format: (v) => `${v} pcs` },
          { header: 'Total Value', key: 'purchase_price', align: 'right', format: (v, row) => `Tk ${((row.stock_quantity || 0) * Number(v || 0)).toFixed(2)}` },
          { header: 'Status', key: 'stock_quantity', align: 'center', format: (v, row) => (v <= 0 ? 'Out of Stock' : v <= row.min_stock_level ? 'Low Stock' : 'In Stock') }
        ],
        data: filteredVariants
      });
    } else {
      exportTableToPdf({
        moduleName: 'Stock Audit',
        title: 'Stock Audit Movement Ledger',
        columns: [
          { header: 'Date', key: 'created_at', format: (v) => formatDateDDMMYYYY(v) },
          { header: 'Product Name', key: 'variant', format: (_, row) => row.variant?.product?.name || '-' },
          { header: 'SKU / Barcode', key: 'variant', format: (_, row) => row.variant?.sku || row.variant?.barcode || '-' },
          { header: 'Change Type', key: 'change_type', align: 'center' },
          { header: 'Quantity Change', key: 'quantity_change', align: 'center', format: (v) => `${v > 0 ? '+' : ''}${v} pcs` },
          { header: 'Previous Stock', key: 'previous_stock', align: 'center' },
          { header: 'New Stock', key: 'new_stock', align: 'center' },
          { header: 'Reason / Notes', key: 'reason' }
        ],
        data: ledger
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Top Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, maxWidth: '380px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search product, SKU, or scan barcode..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setInvPage(1); }}
              style={{ paddingLeft: '32px', height: '34px', fontSize: '12.5px' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => openAdjustModal()}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <SlidersHorizontal size={14} /> Adjust Stock
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'inventory' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('inventory')}
          >
            <List size={14} /> Inventory Levels
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('ledger')}
          >
            <ArrowDownUp size={14} /> Stock Ledger
          </button>
          {isAdminRole(userRole) && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0 10px', height: '32px', gap: '5px', fontWeight: 700 }}
              title="Download PDF Report"
            >
              <FileDown size={14} />
              <span>PDF</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'inventory' ? (
        <>
          {/* Low Stock Alerts banner */}
          {lowStockItems.length > 0 && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'var(--color-danger)'
            }}>
              <AlertTriangle size={18} />
              <div>
                <strong style={{ display: 'inline-block', fontSize: '13px', fontWeight: 700, marginRight: '6px' }}>
                  {lowStockItems.length === 1
                    ? '1 item running low on stock!'
                    : `${lowStockItems.length} items running low on stock!`}
                </strong>
                <span style={{ fontSize: '12px', opacity: 0.9 }}>
                  Restock recommended to prevent stockouts.
                </span>
              </div>
            </div>
          )}

          {/* Master Inventory Grid Table */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Barcode</th>
                  <th style={{ textAlign: 'center' }}>Total Restocked</th>
                  <th style={{ textAlign: 'center' }}>Total Sold</th>
                  <th style={{ textAlign: 'center' }}>Current Stock</th>
                  <th style={{ textAlign: 'center' }}>Min Stock</th>
                  <th>Status</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredVariants.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No matching inventory items found.
                    </td>
                  </tr>
                ) : (
                  filteredVariants
                    .slice((invPage - 1) * invPageSize, invPage * invPageSize)
                    .map((v, idx) => {
                      const isLow = v.stock_quantity <= v.min_stock_level;

                      // Compute sold and restocked quantities from stock_ledger for this variant
                      const variantLedger = ledger.filter(l => l.variant_id === v.id);
                      const totalSold = variantLedger
                        .filter(l => l.transaction_type === 'SALE')
                        .reduce((acc, l) => acc + Math.abs(l.quantity_change), 0);
                      const totalRestocked = variantLedger
                        .filter(l => l.transaction_type === 'PURCHASE')
                        .reduce((acc, l) => acc + l.quantity_change, 0);

                      return (
                        <tr key={v.id}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {(invPage - 1) * invPageSize + idx + 1}
                          </td>
                          <td style={{ fontWeight: 600 }}>{v.product?.name}</td>
                          <td>{v.sku}</td>
                          <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{v.barcode}</td>
                          <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--color-primary)' }}>
                            {totalRestocked}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--color-warning)' }}>
                            {totalSold}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13.5px', color: isLow ? 'var(--color-danger)' : 'var(--color-success)' }}>
                            {v.stock_quantity}
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{v.min_stock_level}</td>
                          <td>
                            <span style={{
                              backgroundColor: isLow ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isLow ? 'var(--color-danger)' : 'var(--color-success)',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}>
                              {isLow ? 'Low Stock' : 'Good'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openAdjustModal(v)}
                              title="Adjust Stock Manually"
                              style={{ padding: '4px 8px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <SlidersHorizontal size={12} /> Adjust
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={invPage}
              totalItems={filteredVariants.length}
              pageSize={invPageSize}
              onPageChange={setInvPage}
              onPageSizeChange={setInvPageSize}
            />
          </div>
        </>
      ) : (
        /* STOCK LEDGER TIMELINE */
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                <th>Date</th>
                <th>Item</th>
                <th>Transaction</th>
                <th>Quantity Change</th>
                <th>Invoice/Ref</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    No stock transaction ledger found. Sales, restocks, and adjustments populate this ledger.
                  </td>
                </tr>
              ) : (
                ledger
                  .slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize)
                  .map((log: any, idx: number) => {
                    const variant = variants.find(v => v.id === log.variant_id);
                    const isPositive = log.quantity_change > 0;

                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                    let badgeColor = 'var(--color-success)';
                    if (log.transaction_type === 'PURCHASE') {
                      badgeBg = 'rgba(59, 130, 246, 0.15)';
                      badgeColor = 'var(--color-primary)';
                    } else if (log.transaction_type === 'ADJUSTMENT') {
                      badgeBg = 'rgba(147, 51, 234, 0.15)';
                      badgeColor = '#9333ea';
                    }

                    return (
                      <tr key={log.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {(ledgerPage - 1) * ledgerPageSize + idx + 1}
                        </td>
                        <td>{formatDateDDMMYYYY(log.created_at)}</td>
                        <td>
                          {variant ? (
                            <>
                              <div style={{ fontWeight: 600 }}>{variant.product?.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                SKU: {variant.sku}
                              </div>
                            </>
                          ) : (
                            'Unknown Product'
                          )}
                        </td>
                        <td>
                          <span style={{
                            backgroundColor: badgeBg,
                            color: badgeColor,
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {log.transaction_type}
                          </span>
                        </td>
                        <td style={{
                          fontWeight: 'bold',
                          color: isPositive ? 'var(--color-success)' : (log.quantity_change < 0 ? 'var(--color-danger)' : 'var(--text-muted)')
                        }}>
                          {isPositive ? `+${log.quantity_change}` : log.quantity_change}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {log.reference_id ? log.reference_id.toUpperCase().substring(0, 8) : 'MANUAL'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{log.notes}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={ledgerPage}
            totalItems={ledger.length}
            pageSize={ledgerPageSize}
            onPageChange={setLedgerPage}
            onPageSizeChange={setLedgerPageSize}
          />
        </div>
      )}

      {/* REUSABLE CLEAN STOCK ADJUSTMENT MODAL */}
      {(adjustingVariant || showGeneralAdjustModal) && (
        <StockAdjustmentModal
          variant={adjustingVariant}
          variantsList={variants}
          onClose={() => {
            setAdjustingVariant(null);
            setShowGeneralAdjustModal(false);
          }}
          onSuccess={() => {
            loadData();
            onRefreshStats?.();
          }}
        />
      )}

    </div>
  );
};
