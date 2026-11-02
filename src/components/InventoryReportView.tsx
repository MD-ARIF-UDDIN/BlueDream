import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../dbService';
import type { ProductVariant } from '../store';
import { Search, FileDown, Package, AlertTriangle, Calendar, Filter, X } from 'lucide-react';
import { Pagination } from './Pagination';
import { exportTableToPdf } from '../utils/pdfExport';
import { isAdminRole } from '../roleUtils';

type InventoryView = 'ALL' | 'BY_CATEGORY' | 'BY_PRODUCT';
type DateFilter = 'today' | 'week' | 'month' | 'month_select' | 'custom' | 'all';

interface InventoryReportViewProps {
  userRole?: string;
}

const formatAmount = (n: number) =>
  Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const InventoryReportView: React.FC<InventoryReportViewProps> = ({ userRole }) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View switch: ALL, BY_CATEGORY, BY_SIZE, BY_PRODUCT
  const [viewType, setViewType] = useState<InventoryView>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'stock_desc' | 'stock_asc' | 'value_desc' | 'sold_desc' | 'name'>('stock_desc');

  // Multi-dimensional dropdown filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');

  // Date filter — same as Sales Report
  const [filter, setFilter] = useState<DateFilter>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [varList, itemsList] = await Promise.all([
          dbService.getVariants(true),
          dbService.getSaleItemsDetailed(true)
        ]);
        setVariants(varList || []);
        setSaleItems(itemsList || []);
      } catch (e) {
        console.error('Failed to load inventory & sales data', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Reset page on view/search/filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [viewType, searchQuery, sortBy, filter, selectedMonth, startDate, endDate, selectedCategory, selectedProduct, selectedBrand]);

  // ── Distinct options for dropdown filters ──
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    variants.forEach(v => {
      const c = v.product?.category?.trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [variants]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    variants.forEach(v => {
      const b = v.product?.brand?.trim();
      if (b) set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [variants]);

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    variants.forEach(v => {
      if (v.product_id && v.product?.name) {
        if (selectedCategory === 'ALL' || (v.product.category || 'Uncategorized') === selectedCategory) {
          map.set(v.product_id, v.product.name);
        }
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [variants, selectedCategory]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedProduct('ALL');
  };

  const hasActiveFilters = selectedCategory !== 'ALL' || selectedProduct !== 'ALL' || selectedBrand !== 'ALL';

  const resetDropdownFilters = () => {
    setSelectedCategory('ALL');
    setSelectedProduct('ALL');
    setSelectedBrand('ALL');
  };

  // ── Date filter helper ──
  const filterByDate = (dateStr: string | undefined) => {
    if (!dateStr) return filter === 'all';
    const date = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (filter) {
      case 'today':
        return date >= startOfToday;
      case 'week':
        return date >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return date >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'month_select':
        if (selectedMonth) {
          const [yStr, mStr] = selectedMonth.split('-');
          return date.getFullYear() === Number(yStr) && date.getMonth() === Number(mStr) - 1;
        }
        return true;
      case 'custom':
        if (startDate && endDate) {
          return date >= new Date(startDate + 'T00:00:00') && date <= new Date(endDate + 'T23:59:59.999');
        } else if (startDate) {
          return date >= new Date(startDate + 'T00:00:00');
        } else if (endDate) {
          return date <= new Date(endDate + 'T23:59:59.999');
        }
        return true;
      case 'all':
      default:
        return true;
    }
  };

  // ── Calculate sales units per variant ──
  const variantSalesMap = useMemo(() => {
    const map = new Map<string, number>();
    saleItems.forEach(si => {
      const saleDate = si.sale?.sale_date || si.created_at;
      if (!filterByDate(saleDate)) return;

      const isReturn = si.sale_type === 'RETURN' || si.is_returned;
      const qty = Number(si.quantity || 0);
      const varId = si.variant_id;
      if (!varId) return;

      const current = map.get(varId) || 0;
      if (isReturn) {
        map.set(varId, current - qty);
      } else {
        map.set(varId, current + qty);
      }
    });
    return map;
  }, [saleItems, filter, selectedMonth, startDate, endDate]);

  // ── Filtered variants by date AND dropdown filters ──
  const filteredVariants = useMemo(() => {
    return variants.filter(v => {
      if (!filterByDate((v as any).created_at)) return false;
      if (selectedCategory !== 'ALL' && (v.product?.category || 'Uncategorized') !== selectedCategory) return false;
      if (selectedProduct !== 'ALL' && v.product_id !== selectedProduct) return false;
      if (selectedBrand !== 'ALL' && (v.product?.brand || '—') !== selectedBrand) return false;
      return true;
    });
  }, [variants, filter, selectedMonth, startDate, endDate, selectedCategory, selectedProduct, selectedBrand]);

  // ── 1. ALL VARIANTS STATS (Row-level including Total Sold) ──
  const allRows = useMemo(() => {
    return filteredVariants.map(v => {
      const stock = Number(v.stock_quantity || 0);
      const purchasePrice = Number(v.purchase_price || 0);
      const sellingPrice = Number(v.selling_price || 0);
      const minStock = Number(v.min_stock_level || 0);
      const totalSold = Math.max(0, variantSalesMap.get(v.id) || 0);

      return {
        variantId: v.id,
        productId: v.product_id,
        productName: v.product?.name || 'Unknown',
        category: v.product?.category || 'Uncategorized',
        brand: v.product?.brand || '—',
        sku: v.sku || '—',
        barcode: v.barcode || '—',
        totalSold,
        stockQuantity: stock,
        minStockLevel: minStock,
        isLowStock: stock <= minStock,
        purchasePrice,
        sellingPrice,
        stockValuation: stock * purchasePrice,
        sellingValuation: stock * sellingPrice,
      };
    });
  }, [filteredVariants, variantSalesMap]);

  // ── 2. BY CATEGORY stats ──
  const categoryStats = useMemo(() => {
    const map = new Map<string, {
      category: string;
      totalVariants: number;
      totalProducts: Set<string>;
      totalStock: number;
      totalSold: number;
      stockValuation: number;
      lowStockVariants: number;
    }>();

    filteredVariants.forEach(v => {
      const cat = v.product?.category || 'Uncategorized';
      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          totalVariants: 0,
          totalProducts: new Set(),
          totalStock: 0,
          totalSold: 0,
          stockValuation: 0,
          lowStockVariants: 0
        });
      }
      const entry = map.get(cat)!;
      entry.totalVariants++;
      if (v.product_id) entry.totalProducts.add(v.product_id);
      entry.totalStock += Number(v.stock_quantity || 0);
      entry.totalSold += Math.max(0, variantSalesMap.get(v.id) || 0);
      entry.stockValuation += Number(v.stock_quantity || 0) * Number(v.purchase_price || 0);
      if (Number(v.stock_quantity) <= Number(v.min_stock_level)) entry.lowStockVariants++;
    });

    return Array.from(map.values()).map(e => ({ ...e, totalProducts: e.totalProducts.size }));
  }, [filteredVariants, variantSalesMap]);

  // ── 3. BY PRODUCT stats ──
  const productStats = useMemo(() => {
    const map = new Map<string, {
      productId: string;
      productName: string;
      category: string;
      brand: string;
      totalVariants: number;
      totalStock: number;
      totalSold: number;
      stockValuation: number;
      lowStockVariants: number;
      sellingValue: number;
    }>();

    filteredVariants.forEach(v => {
      const pid = v.product_id;
      if (!map.has(pid)) {
        map.set(pid, {
          productId: pid,
          productName: v.product?.name || 'Unknown',
          category: v.product?.category || 'Uncategorized',
          brand: v.product?.brand || '—',
          totalVariants: 0,
          totalStock: 0,
          totalSold: 0,
          stockValuation: 0,
          lowStockVariants: 0,
          sellingValue: 0,
        });
      }
      const entry = map.get(pid)!;
      entry.totalVariants++;
      entry.totalStock += Number(v.stock_quantity || 0);
      entry.totalSold += Math.max(0, variantSalesMap.get(v.id) || 0);
      entry.stockValuation += Number(v.stock_quantity || 0) * Number(v.purchase_price || 0);
      entry.sellingValue += Number(v.stock_quantity || 0) * Number(v.selling_price || 0);
      if (Number(v.stock_quantity) <= Number(v.min_stock_level)) entry.lowStockVariants++;
    });

    return Array.from(map.values());
  }, [filteredVariants, variantSalesMap]);

  // Sort + search query helpers
  const q = searchQuery.toLowerCase().trim();

  const filteredAll = useMemo(() =>
    [...allRows]
      .filter(r => !q ||
        r.productName.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q)
      )
      .sort((a, b) =>
        sortBy === 'sold_desc' ? b.totalSold - a.totalSold :
          sortBy === 'stock_asc' ? a.stockQuantity - b.stockQuantity :
            sortBy === 'value_desc' ? b.stockValuation - a.stockValuation :
              sortBy === 'name' ? a.productName.localeCompare(b.productName) :
                b.stockQuantity - a.stockQuantity
      ),
    [allRows, sortBy, q]);

  const filteredCategories = useMemo(() =>
    [...categoryStats]
      .filter(r => !q || r.category.toLowerCase().includes(q))
      .sort((a, b) =>
        sortBy === 'sold_desc' ? b.totalSold - a.totalSold :
          sortBy === 'stock_asc' ? a.totalStock - b.totalStock :
            sortBy === 'value_desc' ? b.stockValuation - a.stockValuation :
              sortBy === 'name' ? a.category.localeCompare(b.category) :
                b.totalStock - a.totalStock
      ),
    [categoryStats, sortBy, q]);

  const filteredProducts = useMemo(() =>
    [...productStats]
      .filter(r => !q || r.productName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q))
      .sort((a, b) =>
        sortBy === 'sold_desc' ? b.totalSold - a.totalSold :
          sortBy === 'stock_asc' ? a.totalStock - b.totalStock :
            sortBy === 'value_desc' ? b.stockValuation - a.stockValuation :
              sortBy === 'name' ? a.productName.localeCompare(b.productName) :
                b.totalStock - a.totalStock
      ),
    [productStats, sortBy, q]);

  // Pagination
  const paginatedAll = filteredAll.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedCategories = filteredCategories.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalItems =
    viewType === 'ALL' ? filteredAll.length :
      viewType === 'BY_CATEGORY' ? filteredCategories.length :
        filteredProducts.length;

  // KPIs
  const totalStockUnits = filteredVariants.reduce((s, v) => s + Number(v.stock_quantity || 0), 0);
  const totalValuation = filteredVariants.reduce((s, v) => s + Number(v.stock_quantity || 0) * Number(v.purchase_price || 0), 0);
  const totalSellingValue = filteredVariants.reduce((s, v) => s + Number(v.stock_quantity || 0) * Number(v.selling_price || 0), 0);
  const totalSoldUnits = filteredAll.reduce((s, r) => s + r.totalSold, 0);
  const lowStockCount = filteredVariants.filter(v => Number(v.stock_quantity) <= Number(v.min_stock_level)).length;
  const uniqueCategories = new Set(filteredVariants.map(v => v.product?.category || 'Uncategorized')).size;
  const uniqueProducts = new Set(filteredVariants.map(v => v.product_id)).size;

  // PDF Export
  const dateRangeLabel =
    filter === 'all' ? 'All Time' :
      filter === 'week' ? 'This Week' :
        filter === 'month' ? 'This Month' :
          filter === 'month_select' ? `Month: ${selectedMonth}` :
            filter === 'custom' ? `${startDate || 'Start'} to ${endDate || 'End'}` :
              'Today';

  const handleExportPdf = () => {
    const summaryCards = [
      { label: 'Total Units in Stock', value: String(totalStockUnits) },
      { label: 'Total Units Sold', value: String(totalSoldUnits) },
      { label: 'Stock Valuation (Cost)', value: `Tk ${formatAmount(totalValuation)}` },
      { label: 'Selling Value', value: `Tk ${formatAmount(totalSellingValue)}` },
      { label: 'Low Stock Variants', value: String(lowStockCount) },
    ];

    if (viewType === 'ALL') {
      exportTableToPdf({
        moduleName: 'Inventory Report',
        title: 'Inventory Report — All Items (Detailed)',
        dateRange: dateRangeLabel,
        summaryCards,
        columns: [
          { header: 'Category', key: 'category' },
          { header: 'Product', key: 'productName' },
          { header: 'Brand', key: 'brand' },
          { header: 'Total Sold', key: 'totalSold', align: 'center' },
          { header: 'Stock Units', key: 'stockQuantity', align: 'center' },
          { header: 'Cost Price', key: 'purchasePrice', align: 'right', format: (v: any) => `Tk ${formatAmount(v)}` },
          { header: 'Selling Price', key: 'sellingPrice', align: 'right', format: (v: any) => `Tk ${formatAmount(v)}` },
          { header: 'Valuation (Cost)', key: 'stockValuation', align: 'right', format: (v: any) => `Tk ${formatAmount(v)}` },
        ],
        data: filteredAll,
      });
    } else if (viewType === 'BY_CATEGORY') {
      exportTableToPdf({
        moduleName: 'Inventory Report',
        title: 'Inventory Report — By Category',
        dateRange: dateRangeLabel,
        summaryCards,
        columns: [
          { header: 'Category', key: 'category' },
          { header: 'Products', key: 'totalProducts', align: 'center' },
          { header: 'Variants', key: 'totalVariants', align: 'center' },
          { header: 'Total Sold', key: 'totalSold', align: 'center' },
          { header: 'Total Stock', key: 'totalStock', align: 'center' },
          { header: 'Low Stock', key: 'lowStockVariants', align: 'center' },
          { header: 'Stock Valuation', key: 'stockValuation', align: 'right', format: (v: any) => `Tk ${formatAmount(v)}` },
        ],
        data: filteredCategories,
      });
    } else {
      exportTableToPdf({
        moduleName: 'Inventory Report',
        title: 'Inventory Report — By Product',
        dateRange: dateRangeLabel,
        summaryCards,
        columns: [
          { header: 'Product', key: 'productName' },
          { header: 'Category', key: 'category' },
          { header: 'Brand', key: 'brand' },
          { header: 'Total Sold', key: 'totalSold', align: 'center' },
          { header: 'Total Stock', key: 'totalStock', align: 'center' },
          { header: 'Low Stock', key: 'lowStockVariants', align: 'center' },
          { header: 'Cost Valuation', key: 'stockValuation', align: 'right', format: (v: any) => `Tk ${formatAmount(v)}` },
          { header: 'Selling Value', key: 'sellingValue', align: 'right', format: (v: any) => `Tk ${formatAmount(v)}` },
        ],
        data: filteredProducts,
      });
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading inventory data...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* ── Date Filter Bar (same as Sales Report) ── */}
      <div className="reports-filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Inventory Report</h3>
          {isAdminRole(userRole) && (
            <button
              onClick={handleExportPdf}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0 10px', height: '28px', fontSize: '11.5px', gap: '5px', fontWeight: 700 }}
              title="Download Inventory PDF Report"
            >
              <FileDown size={13} />
              <span>Download PDF</span>
            </button>
          )}
        </div>

        <div className="reports-tabs-wrapper">
          <div className="reports-tabs-scroll">
            {(['today', 'week', 'month', 'month_select', 'custom', 'all'] as const).map(option => (
              <button
                key={option}
                className="btn btn-sm"
                onClick={() => { setFilter(option); setCurrentPage(1); }}
                style={{
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  borderRadius: '4px',
                  background: filter === option ? 'var(--color-primary)' : 'transparent',
                  color: filter === option ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  boxShadow: filter === option ? 'var(--shadow-xs)' : 'none',
                  height: '28px'
                }}
              >
                <Calendar size={11} style={{ marginRight: '4px', verticalAlign: 'middle', display: 'inline' }} />
                <span>
                  {option === 'all' ? 'All Time' : option === 'week' ? 'This Week' : option === 'month' ? 'This Month' : option === 'month_select' ? 'Select Month' : option === 'custom' ? 'Custom Range' : 'Today'}
                </span>
              </button>
            ))}
          </div>

          {filter === 'month_select' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              backgroundColor: '#ffffff', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', padding: '3px 10px', height: '34px',
              boxShadow: 'var(--shadow-xs)', width: '100%', boxSizing: 'border-box'
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Select Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', fontSize: '11.5px', outline: 'none', fontWeight: 600, color: '#1e293b', height: '24px', flex: 1, cursor: 'pointer' }}
              />
            </div>
          )}

          {filter === 'custom' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
              backgroundColor: '#ffffff', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', padding: '3px 10px', height: '34px',
              boxShadow: 'var(--shadow-xs)', width: '100%', boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11.5px', outline: 'none', fontWeight: 600, color: '#1e293b', height: '24px', width: '100%', cursor: 'pointer' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11.5px', outline: 'none', fontWeight: 600, color: '#1e293b', height: '24px', width: '100%', cursor: 'pointer' }}
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); setCurrentPage(1); }}
                  style={{ fontSize: '10.5px', padding: '0 8px', height: '24px', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="reports-kpi-grid">
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Total Stock Units</div>
          <div className="card-value" style={{ color: 'var(--text-primary)' }}>{totalStockUnits.toLocaleString()}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>across filtered items</div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Total Units Sold</div>
          <div className="card-value" style={{ color: '#0284c7', fontWeight: 800 }}>{totalSoldUnits.toLocaleString()}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>in selected period</div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Stock Valuation (Cost)</div>
          <div className="card-value" style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
            ৳{formatAmount(totalValuation)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>at purchase price</div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Selling Value</div>
          <div className="card-value" style={{ color: 'var(--color-info)' }}>
            ৳{formatAmount(totalSellingValue)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>at selling price</div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Low Stock Variants</div>
          <div className="card-value" style={{ color: lowStockCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {lowStockCount}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>at or below min level</div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Products</div>
          <div className="card-value">{uniqueProducts}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{uniqueCategories} categories</div>
        </div>
      </div>

      {/* ── View Switcher + Search + Sort Bar + Dropdown Filters ── */}
      <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Top Row: Tabs + Search + Sort */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setViewType('ALL'); setCurrentPage(1); }}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '4px',
                border: 'none',
                background: viewType === 'ALL' ? 'var(--color-primary)' : 'transparent',
                color: viewType === 'ALL' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              All
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setViewType('BY_CATEGORY'); setCurrentPage(1); }}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '4px',
                border: 'none',
                background: viewType === 'BY_CATEGORY' ? 'var(--color-primary)' : 'transparent',
                color: viewType === 'BY_CATEGORY' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              By Category
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setViewType('BY_PRODUCT'); setCurrentPage(1); }}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '4px',
                border: 'none',
                background: viewType === 'BY_PRODUCT' ? 'var(--color-primary)' : 'transparent',
                color: viewType === 'BY_PRODUCT' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              By Product
            </button>
          </div>

          {/* Search + Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 320px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '200px', flex: '1 1 200px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder={
                  viewType === 'ALL' ? 'Search product, category, brand, SKU...' :
                    viewType === 'BY_PRODUCT' ? 'Search product, category, brand...' :
                      'Search category...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12px', width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Sort:</span>
              <select
                className="form-control"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ height: '34px', fontSize: '11.5px', fontWeight: 600, width: 'auto', paddingRight: '24px' }}
              >
                <option value="sold_desc">Highest Sold</option>
                <option value="stock_desc">Highest Stock</option>
                <option value="stock_asc">Lowest Stock</option>
                <option value="value_desc">Highest Valuation</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Row: Dedicated Dropdown Filters (Category, Product, Brand) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          paddingTop: '8px',
          borderTop: '1px solid var(--border-color)',
          background: '#f8fafc',
          padding: '8px 10px',
          borderRadius: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
            <Filter size={13} style={{ color: 'var(--color-primary)' }} />
            <span>Filters:</span>
          </div>

          {/* Category Dropdown */}
          <select
            className="form-control"
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            style={{
              height: '30px',
              fontSize: '11.5px',
              fontWeight: 600,
              width: 'auto',
              minWidth: '135px',
              background: selectedCategory !== 'ALL' ? 'var(--color-primary-light)' : '#ffffff',
              color: selectedCategory !== 'ALL' ? 'var(--color-primary)' : 'inherit',
              borderColor: selectedCategory !== 'ALL' ? 'var(--color-primary)' : 'var(--border-color)',
            }}
          >
            <option value="ALL">All Categories</option>
            {categoryOptions.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Product Dropdown */}
          <select
            className="form-control"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            style={{
              height: '30px',
              fontSize: '11.5px',
              fontWeight: 600,
              width: 'auto',
              minWidth: '160px',
              maxWidth: '220px',
              background: selectedProduct !== 'ALL' ? 'var(--color-primary-light)' : '#ffffff',
              color: selectedProduct !== 'ALL' ? 'var(--color-primary)' : 'inherit',
              borderColor: selectedProduct !== 'ALL' ? 'var(--color-primary)' : 'var(--border-color)',
            }}
          >
            <option value="ALL">All Products</option>
            {productOptions.map(prod => (
              <option key={prod.id} value={prod.id}>{prod.name}</option>
            ))}
          </select>

          {/* Brand Dropdown */}
          <select
            className="form-control"
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            style={{
              height: '30px',
              fontSize: '11.5px',
              fontWeight: 600,
              width: 'auto',
              minWidth: '120px',
              background: selectedBrand !== 'ALL' ? 'var(--color-primary-light)' : '#ffffff',
              color: selectedBrand !== 'ALL' ? 'var(--color-primary)' : 'inherit',
              borderColor: selectedBrand !== 'ALL' ? 'var(--color-primary)' : 'var(--border-color)',
            }}
          >
            <option value="ALL">All Brands</option>
            {brandOptions.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetDropdownFilters}
              className="btn btn-secondary btn-sm"
              style={{
                height: '30px',
                padding: '0 8px',
                fontSize: '11px',
                gap: '4px',
                fontWeight: 700,
                color: 'var(--color-danger)',
                borderColor: '#fca5a5',
                background: '#fff'
              }}
              title="Reset all filters"
            >
              <X size={12} />
              <span>Reset Filters</span>
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Showing {filteredVariants.length} matching variant{filteredVariants.length === 1 ? '' : 's'}
          </div>
        </div>

      </div>

      {/* ── 1. ALL REPORT TABLE (Category, Product, Size, Brand, Total Sold, Total Stock) ── */}
      {viewType === 'ALL' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: '920px' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category</th>
                  <th>Product</th>
                  <th>Brand</th>
                  <th style={{ textAlign: 'center' }}>Total Sold</th>
                  <th style={{ textAlign: 'center' }}>Total Stock</th>
                  <th style={{ textAlign: 'center' }}>Low Stock</th>
                  <th style={{ textAlign: 'right' }}>Cost Price</th>
                  <th style={{ textAlign: 'right' }}>Stock Valuation (Cost)</th>
                  <th style={{ textAlign: 'right' }}>Selling Value</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAll.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No inventory records match the current filters.
                    </td>
                  </tr>
                ) : paginatedAll.map((row, idx) => (
                  <tr key={row.variantId}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{row.category}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.productName}</div>
                      {row.sku !== '—' && (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          SKU: {row.sku}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.brand}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        background: row.totalSold > 0 ? '#e0f2fe' : 'transparent',
                        color: row.totalSold > 0 ? '#0284c7' : 'var(--text-muted)',
                        fontSize: '12px'
                      }}>
                        {row.totalSold}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>
                      <span style={{ color: row.stockQuantity === 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                        {row.stockQuantity}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.isLowStock ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '11.5px' }}>
                          <AlertTriangle size={11} /> {row.stockQuantity} / {row.minStockLevel}
                        </span>
                      ) : <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>OK</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--text-muted)' }}>৳{formatAmount(row.purchasePrice)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>৳{formatAmount(row.stockValuation)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-info)' }}>৳{formatAmount(row.sellingValuation)}</td>
                  </tr>
                ))}
              </tbody>
              {filteredAll.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 800 }}>
                    <td colSpan={4} style={{ textAlign: 'right', fontSize: '12px', paddingRight: '8px' }}>Total:</td>
                    <td style={{ textAlign: 'center', color: '#0284c7', fontWeight: 900 }}>{filteredAll.reduce((s, r) => s + r.totalSold, 0)}</td>
                    <td style={{ textAlign: 'center' }}>{filteredAll.reduce((s, r) => s + r.stockQuantity, 0)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{filteredAll.filter(r => r.isLowStock).length} low stock</td>
                    <td style={{ textAlign: 'right' }}>—</td>
                    <td style={{ textAlign: 'right' }}>৳{formatAmount(filteredAll.reduce((s, r) => s + r.stockValuation, 0))}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-info)' }}>৳{formatAmount(filteredAll.reduce((s, r) => s + r.sellingValuation, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
        </div>
      )}

      {/* ── 2. BY CATEGORY TABLE ── */}
      {viewType === 'BY_CATEGORY' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: '650px' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'center' }}>Products</th>
                  <th style={{ textAlign: 'center' }}>Variants</th>
                  <th style={{ textAlign: 'center' }}>Total Sold</th>
                  <th style={{ textAlign: 'center' }}>Total Stock</th>
                  <th style={{ textAlign: 'center' }}>Low Stock</th>
                  <th style={{ textAlign: 'right' }}>Stock Valuation (Cost)</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCategories.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No categories found</td></tr>
                ) : paginatedCategories.map((row, idx) => (
                  <tr key={row.category}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td><span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{row.category}</span></td>
                    <td style={{ textAlign: 'center' }}>{row.totalProducts}</td>
                    <td style={{ textAlign: 'center' }}>{row.totalVariants}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>{row.totalSold}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.totalStock}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.lowStockVariants > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '11.5px' }}>
                          <AlertTriangle size={11} /> {row.lowStockVariants}
                        </span>
                      ) : <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>৳{formatAmount(row.stockValuation)}</td>
                  </tr>
                ))}
              </tbody>
              {filteredCategories.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 800 }}>
                    <td colSpan={4} style={{ textAlign: 'right', fontSize: '12px', paddingRight: '8px' }}>Total:</td>
                    <td style={{ textAlign: 'center', color: '#0284c7' }}>{filteredCategories.reduce((s, r) => s + r.totalSold, 0)}</td>
                    <td style={{ textAlign: 'center' }}>{filteredCategories.reduce((s, r) => s + r.totalStock, 0)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{filteredCategories.reduce((s, r) => s + r.lowStockVariants, 0) || '—'}</td>
                    <td style={{ textAlign: 'right' }}>৳{formatAmount(filteredCategories.reduce((s, r) => s + r.stockValuation, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
        </div>
      )}

      {/* ── 3. BY PRODUCT TABLE ── */}
      {viewType === 'BY_PRODUCT' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: '820px' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th style={{ textAlign: 'center' }}>Variants</th>
                  <th style={{ textAlign: 'center' }}>Total Sold</th>
                  <th style={{ textAlign: 'center' }}>Total Stock</th>
                  <th style={{ textAlign: 'center' }}>Low Stock</th>
                  <th style={{ textAlign: 'right' }}>Cost Valuation</th>
                  <th style={{ textAlign: 'right' }}>Selling Value</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No products found</td></tr>
                ) : paginatedProducts.map((row, idx) => (
                  <tr key={row.productId}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{row.productName}</td>
                    <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{row.category}</td>
                    <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{row.brand}</td>
                    <td style={{ textAlign: 'center' }}>{row.totalVariants}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>{row.totalSold}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      <span style={{ color: row.totalStock === 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>{row.totalStock}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.lowStockVariants > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '11.5px' }}>
                          <AlertTriangle size={11} /> {row.lowStockVariants}
                        </span>
                      ) : <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>৳{formatAmount(row.stockValuation)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-info)' }}>৳{formatAmount(row.sellingValue)}</td>
                  </tr>
                ))}
              </tbody>
              {filteredProducts.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 800 }}>
                    <td colSpan={4} style={{ textAlign: 'right', fontSize: '12px', paddingRight: '8px' }}>Total:</td>
                    <td style={{ textAlign: 'center', color: '#0284c7' }}>{filteredProducts.reduce((s, r) => s + r.totalSold, 0)}</td>
                    <td style={{ textAlign: 'center' }}>{filteredProducts.reduce((s, r) => s + r.totalStock, 0)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{filteredProducts.reduce((s, r) => s + r.lowStockVariants, 0) || '—'}</td>
                    <td style={{ textAlign: 'right' }}>৳{formatAmount(filteredProducts.reduce((s, r) => s + r.stockValuation, 0))}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-info)' }}>৳{formatAmount(filteredProducts.reduce((s, r) => s + r.sellingValue, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
        </div>
      )}

      {/* Empty state */}
      {filteredVariants.length === 0 && !loading && (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontWeight: 700 }}>No inventory data found</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            {hasActiveFilters ? 'No items match the selected dropdown filters' : filter === 'all' ? 'Add products and variants to see inventory reports' : 'No variants were added in the selected date range'}
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetDropdownFilters}
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '14px', marginInline: 'auto' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};
