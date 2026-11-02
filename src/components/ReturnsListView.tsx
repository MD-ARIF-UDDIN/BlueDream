import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useNotificationStore } from '../store';
import { Search, Eye, RotateCcw, ArrowLeftRight, Trash2, ShoppingBag, DollarSign, FileDown, Loader2 } from 'lucide-react';
import { Pagination } from './Pagination';
import { InvoicePrintModal, type InvoiceData } from './InvoicePrintModal';
import { exportTableToPdf } from '../utils/pdfExport';
import { formatDateDDMMYYYY, formatTimeAMPM, formatAmount } from '../utils/dateUtils';
import { isAdminRole } from '../roleUtils';

interface ReturnsListViewProps {
  isRestricted?: boolean;
  userRole?: string;
}

export const ReturnsListView: React.FC<ReturnsListViewProps> = ({ isRestricted = false, userRole }) => {
  const { showToast, showConfirm } = useNotificationStore();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PURE_RETURN' | 'EXCHANGE'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);

  // Selected invoice modal state (View / Print)
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const loadReturnSales = async () => {
    try {
      setLoading(true);
      const allSales = await dbService.getSales();
      // Filter sales that have at least one returned item or a negative net amount (refund)
      const returnList = allSales.filter(s => {
        return s.sale_items?.some((si: any) => si.sale_type === 'RETURN' || si.is_returned || Number(si.total_price) < 0) || Number(s.payable_amount) < 0;
      });
      setSales(returnList);
    } catch (e) {
      console.error('Failed to load return list', e);
      showToast('Failed to load returns list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReturnSales();
  }, []);

  const handleViewDetails = async (sale: any) => {
    setSelectedSale(sale);
    try {
      setItemsLoading(true);
      const items = await dbService.getSaleItems(sale.id);
      setSaleItems(items);
    } catch (e) {
      console.error('Failed to load sale details', e);
      showToast('Failed to load sale details', 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleDeleteSale = (sale: any) => {
    const code = sale.invoice_code || sale.id.toUpperCase().substring(0, 8);
    const validCodes = [
      code,
      sale.invoice_code,
      sale.id,
      sale.id?.substring(0, 8),
      sale.id?.toUpperCase().substring(0, 8)
    ].filter(Boolean) as string[];

    showConfirm(
      'Delete Return / Exchange Invoice',
      `Are you sure you want to permanently delete Return Record #${code}?`,
      async () => {
        try {
          setDeletingSaleId(sale.id);
          await dbService.deleteSale(sale.id);
          showToast(`Invoice #${code} deleted successfully!`, 'success');
          await loadReturnSales();
        } catch (err: any) {
          console.error('Failed to delete sale', err);
          showToast(err.message || 'Failed to delete return invoice', 'error');
        } finally {
          setDeletingSaleId(null);
        }
      },
      undefined,
      {
        confirmInputText: validCodes,
        confirmInputPlaceholder: `Enter invoice #${code}`,
        confirmInputLabel: `To confirm deletion, please type the invoice number (${code}):`,
        confirmButtonText: 'Permanently Delete'
      }
    );
  };

  // Classify transactions
  const getSaleType = (s: any) => {
    const returnItems = (s.sale_items || []).filter((si: any) => si.sale_type === 'RETURN' || si.is_returned || Number(si.total_price) < 0);
    const saleItems = (s.sale_items || []).filter((si: any) => si.sale_type !== 'RETURN' && !si.is_returned && Number(si.total_price) >= 0);
    if (returnItems.length > 0 && saleItems.length === 0) return 'PURE_RETURN';
    if (returnItems.length > 0 && saleItems.length > 0) return 'EXCHANGE';
    return 'PURE_RETURN';
  };

  // Filtered dataset
  const filteredSales = sales.filter(s => {
    const type = getSaleType(s);
    if (filterType !== 'ALL' && type !== filterType) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchesId = s.id.toLowerCase().includes(q) || (s.invoice_code && s.invoice_code.toLowerCase().includes(q));
    const matchesMethod = (s.payment_method || '').toLowerCase().includes(q);
    const matchesPhone = s.customer_phone && s.customer_phone.includes(q);
    const matchesBarcode = s.sale_items?.some((si: any) =>
      si.variant?.barcode?.toLowerCase().includes(q) ||
      si.variant?.sku?.toLowerCase().includes(q) ||
      si.variant?.product?.name?.toLowerCase().includes(q)
    );
    return matchesId || matchesMethod || matchesPhone || matchesBarcode;
  });

  // Calculate KPIs
  const totalReturnTxCount = sales.length;
  let totalReturnedQty = 0;
  let totalRefundValue = 0;
  let totalCashRefund = 0;

  sales.forEach(s => {
    const payable = Number(s.payable_amount || 0);
    if (payable < 0) {
      totalCashRefund += Math.abs(payable);
    }
    (s.sale_items || []).forEach((si: any) => {
      if (si.sale_type === 'RETURN' || si.is_returned) {
        totalReturnedQty += Number(si.quantity || 0);
        totalRefundValue += Math.abs(Number(si.total_price || 0));
      }
    });
  });

  const paginatedSales = filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const invoiceData: InvoiceData | null = selectedSale ? {
    invoiceId: selectedSale.id,
    invoiceCode: selectedSale.invoice_code,
    saleDate: selectedSale.sale_date,
    paymentMethod: selectedSale.payment_method,
    customerPhone: selectedSale.customer_phone,
    customerName: selectedSale.customer_name,
    guarantorName: selectedSale.guarantor_name,
    guarantorPhone: selectedSale.guarantor_phone,
    totalAmount: selectedSale.total_amount,
    discountAmount: selectedSale.discount_amount || 0,
    payableAmount: selectedSale.payable_amount,
    receivedAmount: selectedSale.received_amount || selectedSale.payable_amount,
    dueAmount: selectedSale.due_amount || 0,
    changeAmount: selectedSale.change_amount || 0,
    items: saleItems.map(item => ({
      id: item.id,
      name: item.variant?.product?.name || 'Item',
      sku: item.variant?.sku,
      barcode: item.variant?.barcode,
      code: item.variant?.sku || item.variant?.barcode,
      quantity: item.quantity,
      unitPrice: item.unit_price || (Math.abs(item.total_price) / (item.quantity || 1)),
      totalPrice: item.total_price,
      saleType: item.sale_type || (item.is_returned ? 'RETURN' : 'SALE'),
      returnDate: item.return_date || null
    }))
  } : null;

  const handleDownloadPdf = () => {
    exportTableToPdf({
      moduleName: 'Returns',
      title: 'Returns & Exchanges Ledger',
      subtitle: `Type: ${filterType === 'ALL' ? 'All Returns & Exchanges' : filterType === 'PURE_RETURN' ? 'Pure Returns Only' : 'Exchanges Only'}`,
      summaryCards: [
        { label: 'Total Return Trans.', value: String(totalReturnTxCount) },
        { label: 'Returned Units', value: `${totalReturnedQty} pcs` },
        { label: 'Total Cash Refunded', value: `Tk ${totalCashRefund.toFixed(2)}` }
      ],
      columns: [
        { header: 'Invoice Code', key: 'id', format: (v, row) => row.invoice_code || (v ? v.toUpperCase().substring(0, 8) : '-') },
        { header: 'Date', key: 'sale_date', format: (v) => formatDateDDMMYYYY(v) },
        { header: 'Customer Phone', key: 'customer_phone', format: (v) => v || 'Walk-in' },
        { header: 'Payment Mode', key: 'payment_method', align: 'center' },
        {
          header: 'Returned Products',
          key: 'sale_items',
          format: (_, row) => {
            const retItems = (row.sale_items || []).filter((si: any) => si.sale_type === 'RETURN' || si.is_returned);
            return retItems.map((si: any) => `${si.variant?.sku || si.variant?.barcode || 'Item'} (${si.quantity || 1} pcs)`).join(', ') || '-';
          }
        },
        {
          header: 'Replacement Products',
          key: 'sale_items',
          format: (_, row) => {
            const newItems = (row.sale_items || []).filter((si: any) => si.sale_type !== 'RETURN' && !si.is_returned);
            return newItems.map((si: any) => `${si.variant?.sku || si.variant?.barcode || 'Item'} (${si.quantity || 1} pcs)`).join(', ') || '-';
          }
        },
        { header: 'Net Payable', key: 'payable_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
        { header: 'Paid', key: 'received_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
        { header: 'Refund / Due', key: 'due_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` }
      ],
      data: filteredSales
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* KPI Top Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-title" style={{ color: '#991b1b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Returns & Exchanges
              </div>
              <div className="card-value" style={{ fontSize: '20px', fontWeight: 800, color: '#dc2626' }}>
                {totalReturnTxCount}
              </div>
            </div>
            <span style={{ background: '#fee2e2', color: '#dc2626', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
              <RotateCcw size={18} />
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #ea580c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-title" style={{ color: '#9a3412', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                Returned Product Units
              </div>
              <div className="card-value" style={{ fontSize: '20px', fontWeight: 800, color: '#ea580c' }}>
                {totalReturnedQty} pcs
              </div>
            </div>
            <span style={{ background: '#ffedd5', color: '#ea580c', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
              <ShoppingBag size={18} />
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #b91c1c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-title" style={{ color: '#881337', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Cash Refunded
              </div>
              <div className="card-value" style={{ fontSize: '20px', fontWeight: 800, color: '#b91c1c' }}>
                ৳{totalCashRefund.toFixed(2)}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 600 }}>
                Merchandise credit: ৳{totalRefundValue.toFixed(2)}
              </div>
            </div>
            <span style={{ background: '#ffe4e6', color: '#b91c1c', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
              <DollarSign size={18} />
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search return by invoice code, customer phone, product name, or barcode..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={{ paddingLeft: '36px', width: '100%', height: '36px' }}
          />
        </div>

        {/* Submenu Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setFilterType('ALL'); setCurrentPage(1); }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: filterType === 'ALL' ? 'var(--color-primary)' : 'transparent',
              color: filterType === 'ALL' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            All Returns ({sales.length})
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setFilterType('PURE_RETURN'); setCurrentPage(1); }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: filterType === 'PURE_RETURN' ? '#dc2626' : 'transparent',
              color: filterType === 'PURE_RETURN' ? '#fff' : '#b91c1c'
            }}
          >
            Pure Returns / Refunds
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setFilterType('EXCHANGE'); setCurrentPage(1); }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: filterType === 'EXCHANGE' ? '#1d4ed8' : 'transparent',
              color: filterType === 'EXCHANGE' ? '#fff' : '#1d4ed8'
            }}
          >
            Exchanges
          </button>
        </div>

        {isAdminRole(userRole) && (
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="btn btn-secondary btn-sm"
            style={{ height: '36px', padding: '0 12px', gap: '6px', fontWeight: 700 }}
            title="Download Returns Ledger PDF"
          >
            <FileDown size={14} />
            <span>Download PDF</span>
          </button>
        )}
      </div>

      {/* Returns Invoices List Table */}
      {loading ? (
        <div style={{ padding: '24px', fontSize: '13px', textAlign: 'center' }}>Loading returns & exchange records...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                <th>Invoice Code</th>
                <th>Date</th>
                <th>Customer Phone</th>
                <th>Type</th>
                <th>Returned Products</th>
                <th>Replacement Products</th>
                <th style={{ textAlign: 'right' }}>Return Credit</th>
                <th style={{ textAlign: 'right' }}>Net Settlement</th>
                <th style={{ textAlign: 'center' }}>Payment Mode</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    No return or exchange records found matching your query.
                  </td>
                </tr>
              ) : (
                paginatedSales.map((s, idx) => {
                  const type = getSaleType(s);
                  const returnItems = (s.sale_items || []).filter((si: any) => si.sale_type === 'RETURN' || si.is_returned);
                  const newItems = (s.sale_items || []).filter((si: any) => si.sale_type !== 'RETURN' && !si.is_returned);

                  const returnCredit = returnItems.reduce((acc: number, si: any) => acc + Math.abs(Number(si.total_price || 0)), 0);
                  const isRefund = s.payable_amount < 0;

                  return (
                    <tr key={s.id}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '12px', color: 'var(--color-primary)' }}>
                          #{s.invoice_code || s.id.toUpperCase().substring(0, 8)}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDateDDMMYYYY(s.sale_date)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{formatTimeAMPM(s.sale_date)}</div>
                      </td>
                      <td style={{ fontWeight: s.customer_phone ? 600 : 'normal', fontSize: '12px', color: s.customer_phone ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {s.customer_phone ? `📞 ${s.customer_phone}` : '-'}
                      </td>
                      <td>
                        {type === 'PURE_RETURN' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            whiteSpace: 'nowrap'
                          }}>
                            <RotateCcw size={10} /> PURE RETURN
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            whiteSpace: 'nowrap'
                          }}>
                            <ArrowLeftRight size={10} /> EXCHANGE
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {returnItems.map((si: any, rIdx: number) => (
                            <div key={rIdx} style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ color: '#dc2626', fontWeight: 700 }}>•</span>
                              <strong>{si.variant?.product?.name || 'Product'}</strong>
                              <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0 4px', borderRadius: '3px', fontWeight: 700, fontSize: '10px' }}>
                                x{si.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {newItems.length === 0 ? (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>None (Cash Refund)</span>
                          ) : (
                            newItems.map((si: any, nIdx: number) => (
                              <div key={nIdx} style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ color: '#1d4ed8', fontWeight: 700 }}>+</span>
                                <strong>{si.variant?.product?.name || 'Product'}</strong>
                                <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0 4px', borderRadius: '3px', fontWeight: 700, fontSize: '10px' }}>
                                  x{si.quantity}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: '12.5px' }}>
                        -৳{returnCredit.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: isRefund ? '#dc2626' : Number(s.payable_amount) === 0 ? '#059669' : 'var(--color-primary)' }}>
                        {isRefund ? `Refund: ৳${Math.abs(Number(s.payable_amount)).toFixed(2)}` : Number(s.payable_amount) === 0 ? 'Even (৳0.00)' : `Paid: ৳${Number(s.payable_amount).toFixed(2)}`}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#475569',
                          textTransform: 'uppercase'
                        }}>
                          {s.payment_method || 'CASH'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleViewDetails(s)}
                            title="View / Print Return Invoice"
                            style={{ height: '26px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <Eye size={12} /> View
                          </button>
                          {!isRestricted && (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={deletingSaleId === s.id}
                              onClick={() => handleDeleteSale(s)}
                              title="Delete Record"
                              style={{
                                width: '26px',
                                height: '26px',
                                padding: 0,
                                opacity: deletingSaleId === s.id ? 0.6 : 1,
                                cursor: deletingSaleId === s.id ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {deletingSaleId === s.id ? (
                                <Loader2 size={12} style={{ animation: 'spinLoader 0.7s linear infinite' }} />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            totalItems={filteredSales.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {/* Invoice Details & Print Modal */}
      {selectedSale && !itemsLoading && invoiceData && (
        <InvoicePrintModal
          data={invoiceData}
          onClose={() => {
            setSelectedSale(null);
            setSaleItems([]);
          }}
        />
      )}

    </div>
  );
};
