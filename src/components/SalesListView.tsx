import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useNotificationStore } from '../store';
import { Search, Eye, Edit2, Trash2, FileDown, Coins, X, Loader2 } from 'lucide-react';
import { Pagination } from './Pagination';
import { InvoicePrintModal, type InvoiceData } from './InvoicePrintModal';
import { EditSaleModal } from './EditSaleModal';
import { exportTableToPdf } from '../utils/pdfExport';
import { formatDateDDMMYYYY, formatTimeAMPM, formatAmount } from '../utils/dateUtils';
import { isAdminRole } from '../roleUtils';

interface SalesListViewProps {
  isRestricted?: boolean;
  userRole?: string;
}

export const SalesListView: React.FC<SalesListViewProps> = ({ isRestricted = false, userRole }) => {
  const { showToast, showConfirm } = useNotificationStore();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'SALES' | 'RETURNS'>('SALES');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  
  // Selected sale details modal state (View / Print)
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Edit sale modal state
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [editingSaleItems, setEditingSaleItems] = useState<any[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  // Collect due modal state
  const [dueCollectSale, setDueCollectSale] = useState<any | null>(null);
  const [dueCollectAmount, setDueCollectAmount] = useState<number>(0);
  const [dueCollectMethod, setDueCollectMethod] = useState<string>('Cash');
  const [dueSubmitting, setDueSubmitting] = useState(false);

  const loadSales = async () => {
    try {
      setLoading(true);
      const list = await dbService.getSales(false, isRestricted ? 5 : undefined);
      setSales(isRestricted ? list.slice(0, 5) : list);
    } catch (e) {
      console.error('Failed to load sales list', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [isRestricted]);

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

  const handleStartEdit = async (sale: any) => {
    try {
      setEditLoading(true);
      const items = await dbService.getSaleItems(sale.id);
      setEditingSaleItems(items);
      setEditingSale(sale);
    } catch (e) {
      console.error('Failed to load sale items for editing', e);
      showToast('Failed to load sale items for editing', 'error');
    } finally {
      setEditLoading(false);
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
      'Delete Sale Invoice',
      `Are you sure you want to permanently delete Invoice #${code}? All sold products in this invoice will be automatically returned to inventory stock.`,
      async () => {
        try {
          setDeletingSaleId(sale.id);
          await dbService.deleteSale(sale.id);
          showToast(`Invoice #${code} deleted and products restocked successfully!`, 'success');
          await loadSales();
        } catch (err: any) {
          console.error('Failed to delete sale', err);
          showToast(err.message || 'Failed to delete sale invoice', 'error');
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

  const openCollectDueModal = (sale: any) => {
    setDueCollectSale(sale);
    setDueCollectAmount(Number(sale.due_amount || 0));
    setDueCollectMethod('Cash');
  };

  const handleCollectDueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueCollectSale) return;
    const amount = Number(dueCollectAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid collection amount greater than 0', 'warning');
      return;
    }
    const maxDue = Number(dueCollectSale.due_amount || 0);
    if (amount > maxDue) {
      showToast(`Collection amount cannot exceed remaining due (৳${formatAmount(maxDue)})`, 'warning');
      return;
    }

    try {
      setDueSubmitting(true);
      await dbService.collectDue(dueCollectSale.id, amount, dueCollectMethod);
      const code = dueCollectSale.invoice_code || dueCollectSale.id.toUpperCase().substring(0, 8);
      showToast(`Successfully collected ৳${formatAmount(amount)} for Invoice #${code}!`, 'success');
      setDueCollectSale(null);
      await loadSales();
    } catch (err: any) {
      console.error('Failed to collect due:', err);
      showToast(err.message || 'Failed to collect due', 'error');
    } finally {
      setDueSubmitting(false);
    }
  };

  // Filter sales
  const baseSales = isRestricted ? sales.slice(0, 5) : sales;
  const filteredSales = baseSales.filter(s => {
    const hasReturn = s.sale_items?.some((si: any) => si.sale_type === 'RETURN' || si.is_returned || Number(si.total_price) < 0) || Number(s.payable_amount) < 0;
    if (filterTab === 'RETURNS' && !hasReturn) return false;
    if (filterTab === 'SALES' && hasReturn) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchesId = s.id.toLowerCase().includes(q) || (s.invoice_code && s.invoice_code.toLowerCase().includes(q));
    const matchesMethod = (s.payment_method || '').toLowerCase().includes(q);
    const matchesCustomer = (s.customer_phone && s.customer_phone.includes(q)) ||
                            (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
                            (s.guarantor_name && s.guarantor_name.toLowerCase().includes(q)) ||
                            (s.guarantor_phone && s.guarantor_phone.includes(q));
    const matchesBarcode = s.sale_items?.some((si: any) => 
      si.variant?.barcode?.toLowerCase().includes(q) ||
      si.variant?.sku?.toLowerCase().includes(q) ||
      si.variant?.product?.name?.toLowerCase().includes(q)
    );
    return matchesId || matchesMethod || matchesCustomer || matchesBarcode;
  });

  const paginatedSales = isRestricted
    ? filteredSales.slice(0, 5)
    : filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
    const totalInvoices = filteredSales.length;
    const totalSubtotal = filteredSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalDiscount = filteredSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0);
    const totalPayable = filteredSales.reduce((sum, s) => sum + Number(s.payable_amount || 0), 0);
    const totalPaid = filteredSales.reduce((sum, s) => sum + Number(s.received_amount || (s.payable_amount - (s.due_amount || 0)) || 0), 0);
    const totalDue = filteredSales.reduce((sum, s) => sum + Number(s.due_amount || 0), 0);

    exportTableToPdf({
      moduleName: 'Sales',
      title: 'Completed Sales & Invoices Ledger',
      subtitle: `Filter: ${filterTab === 'ALL' ? 'All Invoices' : filterTab === 'SALES' ? 'Sales Only' : 'Returns & Exchanges Only'}`,
      summaryCards: [
        { label: 'Total Invoices', value: String(totalInvoices) },
        { label: 'Total Sales (Gross)', value: `Tk ${formatAmount(totalSubtotal)}` },
        { label: 'Total Discount', value: `Tk ${formatAmount(totalDiscount)}` },
        { label: 'Net Payable', value: `Tk ${formatAmount(totalPayable)}` },
        { label: 'Total Collected', value: `Tk ${formatAmount(totalPaid)}` },
        { label: 'Total Due', value: `Tk ${formatAmount(totalDue)}` }
      ],
      columns: [
        { header: 'Invoice Code', key: 'id', format: (v, row) => row.invoice_code || (v ? v.toUpperCase().substring(0, 8) : '-') },
        { header: 'Date', key: 'sale_date', format: (v) => formatDateDDMMYYYY(v) },
        { 
          header: 'Customer', 
          key: 'customer_name', 
          format: (_, row) => {
            const parts = [];
            if (row.customer_name) parts.push(row.customer_name);
            if (row.customer_phone) parts.push(`Ph: ${row.customer_phone}`);
            if (row.guarantor_name) parts.push(`Guarantor: ${row.guarantor_name} (${row.guarantor_phone || '-'})`);
            return parts.length > 0 ? parts.join('\n') : 'Walk-in';
          } 
        },
        { 
          header: 'Barcode', 
          key: 'sale_items', 
          format: (_, row) => {
            const barcodes = (row.sale_items || [])
              .map((it: any) => it.variant?.barcode)
              .filter(Boolean);
            return barcodes.length > 0 ? barcodes.join('\n') : '-';
          }
        },
        { header: 'Payment Mode', key: 'payment_method', align: 'center' },
        { header: 'Subtotal', key: 'total_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
        { header: 'Discount', key: 'discount_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
        { header: 'Total Payable', key: 'payable_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
        { header: 'Paid', key: 'received_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
        { header: 'Due', key: 'due_amount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` }
      ],
      data: filteredSales
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Search & Submenu Filter bar */}
      <div className="card" style={{ padding: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search by invoice code, barcode, product, phone number, or payment mode..."
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
            onClick={() => { setFilterTab('ALL'); setCurrentPage(1); }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: filterTab === 'ALL' ? 'var(--color-primary)' : 'transparent',
              color: filterTab === 'ALL' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            All Invoices
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setFilterTab('SALES'); setCurrentPage(1); }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: filterTab === 'SALES' ? 'var(--color-primary)' : 'transparent',
              color: filterTab === 'SALES' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            Sales Only
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setFilterTab('RETURNS'); setCurrentPage(1); }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: filterTab === 'RETURNS' ? '#dc2626' : 'transparent',
              color: filterTab === 'RETURNS' ? '#fff' : '#b91c1c'
            }}
          >
            Returns & Exchanges Only
          </button>
        </div>

        {isAdminRole(userRole) && (
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="btn btn-secondary btn-sm"
            style={{ height: '36px', padding: '0 12px', gap: '6px', fontWeight: 700 }}
            title="Download Ledger PDF"
          >
            <FileDown size={14} />
            <span>Download PDF</span>
          </button>
        )}
      </div>

      {/* Sales Invoices List */}
      {loading ? (
        <div style={{ padding: '16px', fontSize: '13px' }}>Loading completed sales list...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                <th>Invoice Code</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Product Code</th>
                <th>Barcode</th>
                <th>Payment Mode</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th style={{ textAlign: 'right' }}>Discount</th>
                <th style={{ textAlign: 'right' }}>Total Payable</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Due</th>
                <th style={{ width: '180px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                    No completed invoices found.
                  </td>
                </tr>
              ) : (
                paginatedSales.map((s, idx) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {(currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {s.invoice_code || s.id.toUpperCase().substring(0, 8)}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDateDDMMYYYY(s.sale_date)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{formatTimeAMPM(s.sale_date)}</div>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {s.customer_name && (
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.customer_name}</div>
                      )}
                      {s.customer_phone ? (
                        <div style={{ fontSize: '11px', color: s.customer_name ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: s.customer_name ? 500 : 600, marginTop: s.customer_name ? '1px' : '0' }}>
                          📞 {s.customer_phone}
                        </div>
                      ) : !s.customer_name ? (
                        <span style={{ color: 'var(--text-muted)' }}>Walk-in</span>
                      ) : null}
                      {s.guarantor_name && (
                        <div style={{ fontSize: '10px', color: 'var(--color-primary)', marginTop: '2px', fontWeight: 600 }}>
                          G: {s.guarantor_name} {s.guarantor_phone ? `(${s.guarantor_phone})` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        {s.sale_items && s.sale_items.length > 0 ? (
                          s.sale_items.map((item: any, itemIdx: number) => {
                            const sku = item.variant?.sku || '-';
                            const productName = item.variant?.product?.name || 'Product';
                            return (
                              <span
                                key={itemIdx}
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  background: 'var(--bg-primary)',
                                  border: '1px solid var(--border-color)',
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap'
                                }}
                                title={`${productName} - SKU: ${sku}`}
                              >
                                {sku}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        {s.sale_items && s.sale_items.length > 0 ? (
                          s.sale_items.map((item: any, itemIdx: number) => {
                            const barcode = item.variant?.barcode || '-';
                            const productName = item.variant?.product?.name || 'Product';
                            return (
                              <span
                                key={itemIdx}
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  background: 'var(--bg-primary)',
                                  border: '1px solid var(--border-color)',
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap'
                                }}
                                title={`${productName} - Qty: ${item.quantity || 1}`}
                              >
                                {barcode}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        background: 'var(--bg-primary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>{s.payment_method}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '12.5px' }}>৳{formatAmount(s.total_amount)}</td>
                    <td style={{ textAlign: 'right', fontSize: '12.5px', color: s.discount_amount > 0 ? 'var(--color-danger)' : 'inherit' }}>
                      ৳{formatAmount(s.discount_amount)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: 'var(--color-primary)' }}>
                      ৳{formatAmount(s.payable_amount)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12.5px', color: 'var(--color-success)' }}>
                      ৳{formatAmount(s.received_amount !== undefined && s.received_amount !== null ? s.received_amount : (s.payable_amount - s.due_amount))}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12.5px', color: s.due_amount > 0 ? 'var(--color-danger)' : 'inherit' }}>
                      {Number(s.due_amount) > 0 ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span>৳{formatAmount(s.due_amount)}</span>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openCollectDueModal(s)}
                            style={{
                              padding: '1px 6px',
                              fontSize: '10px',
                              height: '19px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '4px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Collect Due Payment"
                          >
                            Collect
                          </button>
                        </div>
                      ) : (
                        '৳0'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        {Number(s.due_amount) > 0 && (
                          <button
                            className="btn btn-sm"
                            style={{
                              padding: '0 6px',
                              fontSize: '11.5px',
                              height: '26px',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                            onClick={() => openCollectDueModal(s)}
                            title="Collect Due Payment"
                          >
                            <Coins size={12} /> Due
                          </button>
                        )}

                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0 6px', fontSize: '11.5px', height: '26px' }}
                          onClick={() => handleViewDetails(s)}
                          title="View / Print Invoice"
                        >
                          <Eye size={12} style={{ marginRight: '2px' }} /> View
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0 6px', fontSize: '11.5px', height: '26px', color: 'var(--color-primary)' }}
                          onClick={() => handleStartEdit(s)}
                          disabled={editLoading}
                          title="Edit Sale and Adjust Stock"
                        >
                          <Edit2 size={12} style={{ marginRight: '2px' }} /> Edit
                        </button>

                        <button
                          className="btn btn-sm"
                          disabled={deletingSaleId === s.id}
                          style={{
                            padding: '0 6px',
                            fontSize: '11.5px',
                            height: '26px',
                            backgroundColor: '#fee2e2',
                            color: 'var(--color-danger)',
                            border: '1px solid #fecaca',
                            opacity: deletingSaleId === s.id ? 0.6 : 1,
                            cursor: deletingSaleId === s.id ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          onClick={() => handleDeleteSale(s)}
                          title="Delete Invoice and Restock Items"
                        >
                          {deletingSaleId === s.id ? (
                            <>
                              <Loader2 size={12} style={{ animation: 'spinLoader 0.7s linear infinite' }} /> Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 size={12} /> Delete
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!isRestricted && (
            <Pagination 
              currentPage={currentPage}
              totalItems={filteredSales.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>
      )}

      {/* 58mm THERMAL RECEIPT / INVOICE MODAL */}
      {selectedSale && !itemsLoading && invoiceData && (
        <InvoicePrintModal
          data={invoiceData}
          onClose={() => {
            setSelectedSale(null);
            setSaleItems([]);
          }}
        />
      )}

      {/* EDIT SALE MODAL */}
      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          initialItems={editingSaleItems}
          onClose={() => {
            setEditingSale(null);
            setEditingSaleItems([]);
          }}
          onSuccess={() => {
            loadSales();
          }}
        />
      )}

      {/* COLLECT DUE MODAL */}
      {dueCollectSale && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '16px'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: 'var(--bg-primary)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Coins size={18} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Collect Due Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setDueCollectSale(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCollectDueSubmit} style={{ padding: '20px' }}>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '12.5px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Invoice:</span>
                  <span style={{ fontWeight: 700 }}>{dueCollectSale.invoice_code || dueCollectSale.id.toUpperCase().substring(0, 8)}</span>
                </div>
                {dueCollectSale.customer_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                    <span style={{ fontWeight: 600 }}>{dueCollectSale.customer_name}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Payable:</span>
                  <span style={{ fontWeight: 600 }}>৳{formatAmount(dueCollectSale.payable_amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Already Received:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                    ৳{formatAmount(dueCollectSale.received_amount !== undefined && dueCollectSale.received_amount !== null ? dueCollectSale.received_amount : (dueCollectSale.payable_amount - dueCollectSale.due_amount))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>Remaining Due:</span>
                  <span style={{ fontWeight: 800, color: '#dc2626', fontSize: '13.5px' }}>
                    ৳{formatAmount(dueCollectSale.due_amount)}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Amount to Collect (৳) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  max={Number(dueCollectSale.due_amount || 0)}
                  className="form-control"
                  style={{ width: '100%', height: '38px', fontSize: '14px', fontWeight: 700 }}
                  value={dueCollectAmount || ''}
                  onChange={(e) => setDueCollectAmount(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Payment Method
                </label>
                <select
                  className="form-control"
                  style={{ width: '100%', height: '38px', fontSize: '13px' }}
                  value={dueCollectMethod}
                  onChange={(e) => setDueCollectMethod(e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Card">Card / POS Terminal</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: '36px', padding: '0 16px', fontSize: '13px' }}
                  onClick={() => setDueCollectSale(null)}
                  disabled={dueSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ height: '36px', padding: '0 18px', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  disabled={dueSubmitting}
                >
                  {dueSubmitting ? (
                    <>
                      <Loader2 size={14} style={{ animation: 'spinLoader 0.7s linear infinite' }} /> Processing...
                    </>
                  ) : (
                    'Confirm Collection'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};


