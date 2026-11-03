import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../dbService';
import type { ProductVariant } from '../store';
import { useNotificationStore } from '../store';
import { 
  Plus, Trash2, Printer, Search, Edit3, Check, 
  X, FileDown, SlidersHorizontal, AlertTriangle, 
  Package, DollarSign, Layers, CheckSquare, Square
} from 'lucide-react';
import { BarcodeLabelModal, printVariantsBatchLabels } from './BarcodeLabelModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { Pagination } from './Pagination';
import { exportTableToPdf } from '../utils/pdfExport';
import { isAdminRole } from '../roleUtils';

interface ProductsViewProps {
  onRefreshStats: () => void;
  userRole?: string;
}

const GENTS_CATEGORIES: string[] = [
  'T-Shirt',
  'Polo Shirt',
  'Casual Shirt',
  'Formal Shirt',
  'Panjabi / Kurta',
  'Jeans Pant',
  'Gabardine / Chino Pant',
  'Formal Pant / Trouser',
  'Cargo Pant',
  'Joggers / Track Pant',
  'Shorts',
  'Hoodie / Sweatshirt',
  'Jacket / Blazer',
  'Sweater',
  'Pajama / Lungi',
  'Underwear / Innerwear',
  'Belt & Wallet',
  'Shoes / Footwear',
  'Cap / Accessories'
];

const getNextGlobalBarcode = (
  variantsList: { barcode?: string }[],
  extraExcludedBarcodes: string[] = [],
  offset = 0
): string => {
  const usedBarcodes = new Set<string>();
  let maxNum = 0;

  for (const v of variantsList) {
    if (v.barcode) {
      const clean = v.barcode.trim().replace(/[^0-9a-zA-Z]/g, '');
      if (clean) {
        usedBarcodes.add(clean);
        usedBarcodes.add(clean.toLowerCase());
        const digits = clean.replace(/[^0-9]/g, '');
        if (digits && digits.length <= 12) {
          const parsed = parseInt(digits, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }
  }

  for (const bc of extraExcludedBarcodes) {
    if (bc) {
      const clean = bc.trim().replace(/[^0-9a-zA-Z]/g, '');
      if (clean) {
        usedBarcodes.add(clean);
        usedBarcodes.add(clean.toLowerCase());
        const digits = clean.replace(/[^0-9]/g, '');
        if (digits && digits.length <= 12) {
          const parsed = parseInt(digits, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }
  }

  let candidate = Math.max(1, maxNum + 1);
  let availableFound = 0;

  while (true) {
    const candidateStr = String(candidate).padStart(6, '0');
    if (!usedBarcodes.has(candidateStr) && !usedBarcodes.has(String(candidate))) {
      if (availableFound === offset) {
        return candidateStr;
      }
      availableFound++;
    }
    candidate++;
  }
};

const generateProductSku = (
  productName: string,
  serialNumber: number | string = 1
): string => {
  const prodClean = (productName || 'PRD').replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'PRD';
  const year2Digits = new Date().getFullYear().toString().slice(-2);
  const serial = typeof serialNumber === 'number' ? String(serialNumber).padStart(3, '0') : String(serialNumber || '001').padStart(3, '0');
  return `${prodClean}-${year2Digits}-${serial}`;
};

export const ProductsView: React.FC<ProductsViewProps> = ({ onRefreshStats, userRole }) => {
  const { showToast } = useNotificationStore();

  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Filter, Sort, Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  // Modal triggers
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [barcodeVariantModal, setBarcodeVariantModal] = useState<ProductVariant | null>(null);
  const [stockAdjustVariant, setStockAdjustVariant] = useState<ProductVariant | null>(null);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);

  // Product Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formPurchasePrice, setFormPurchasePrice] = useState<number | string>(0);
  const [formSellingPrice, setFormSellingPrice] = useState<number | string>(0);
  const [formStockQuantity, setFormStockQuantity] = useState<number | string>(0);
  const [formMinStock, setFormMinStock] = useState<number | string>(2);
  const [formDescription, setFormDescription] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  const loadData = async (force = false) => {
    try {
      setLoading(true);
      const varList = await dbService.getVariants(force);
      setVariants(varList);
    } catch (err: any) {
      console.error('Failed to load products:', err);
      showToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Distinct category options from existing inventory + presets
  const distinctCategories = useMemo(() => {
    const set = new Set<string>(GENTS_CATEGORIES);
    variants.forEach(v => {
      const c = v.product?.category?.trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [variants]);

  // Filtered variants
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return variants.filter(v => {
      const pName = (v.product?.name || '').toLowerCase();
      const pCat = (v.product?.category || '').toLowerCase();
      const pBrand = (v.product?.brand || '').toLowerCase();
      const sku = (v.sku || '').toLowerCase();
      const barcode = (v.barcode || '').toLowerCase();

      const matchesSearch = !q || 
        pName.includes(q) || 
        pCat.includes(q) || 
        pBrand.includes(q) || 
        sku.includes(q) || 
        barcode.includes(q);

      if (!matchesSearch) return false;

      if (categoryFilter && (v.product?.category || '') !== categoryFilter) {
        return false;
      }

      if (lowStockOnly && v.stock_quantity > v.min_stock_level) {
        return false;
      }

      return true;
    });
  }, [variants, searchQuery, categoryFilter, lowStockOnly]);

  // Pagination calculation
  const totalItems = filteredProducts.length;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Inventory KPI Totals
  const totalStockUnits = useMemo(() => variants.reduce((acc, v) => acc + (Number(v.stock_quantity) || 0), 0), [variants]);
  const totalCostValuation = useMemo(() => variants.reduce((acc, v) => acc + ((Number(v.stock_quantity) || 0) * (Number(v.purchase_price) || 0)), 0), [variants]);
  const totalRetailValuation = useMemo(() => variants.reduce((acc, v) => acc + ((Number(v.stock_quantity) || 0) * (Number(v.selling_price) || 0)), 0), [variants]);
  const lowStockCount = useMemo(() => variants.filter(v => v.stock_quantity <= v.min_stock_level).length, [variants]);

  // Open Add Product Modal
  const handleOpenAddProduct = () => {
    setEditingVariant(null);
    setFormName('');
    setFormCategory(distinctCategories[0] || 'T-Shirt');
    setIsCustomCategory(false);
    setCustomCategoryInput('');
    setFormBrand('');
    const nextBarcode = getNextGlobalBarcode(variants);
    setFormBarcode(nextBarcode);
    setFormSku(generateProductSku('PRD', variants.length + 1));
    setFormPurchasePrice(0);
    setFormSellingPrice(0);
    setFormStockQuantity(0);
    setFormMinStock(2);
    setFormDescription('');
    setShowProductModal(true);
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (v: ProductVariant) => {
    setEditingVariant(v);
    setFormName(v.product?.name || '');
    const cat = v.product?.category || '';
    setFormCategory(cat);
    const isPreset = GENTS_CATEGORIES.includes(cat);
    if (cat && !isPreset) {
      setIsCustomCategory(true);
      setCustomCategoryInput(cat);
    } else {
      setIsCustomCategory(false);
      setCustomCategoryInput('');
    }
    setFormBrand(v.product?.brand || '');
    setFormBarcode(v.barcode || '');
    setFormSku(v.sku || '');
    setFormPurchasePrice(v.purchase_price || 0);
    setFormSellingPrice(v.selling_price || 0);
    setFormStockQuantity(v.stock_quantity || 0);
    setFormMinStock(v.min_stock_level || 2);
    setFormDescription(v.product?.description || '');
    setShowProductModal(true);
  };

  // Auto-generate SKU when name changes in Add modal
  const handleFormNameChange = (val: string) => {
    setFormName(val);
    if (!editingVariant) {
      setFormSku(generateProductSku(val, variants.length + 1));
    }
  };

  // Save Product (Add or Edit)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Product name is required', 'error');
      return;
    }

    const finalCategory = (isCustomCategory ? customCategoryInput : formCategory).trim() || 'General';
    const cleanBarcode = (formBarcode || '').trim().replace(/[^0-9a-zA-Z]/g, '') || getNextGlobalBarcode(variants);
    const cleanSku = (formSku || '').trim() || generateProductSku(formName, variants.length + 1);

    try {
      setSavingProduct(true);
      showToast(editingVariant ? 'Updating product...' : 'Saving product...', 'info');

      // 1. Save or update Product
      const savedProd = await dbService.saveProduct({
        ...(editingVariant?.product_id ? { id: editingVariant.product_id } : {}),
        name: formName.trim(),
        category: finalCategory,
        brand: formBrand.trim() || undefined,
        description: formDescription.trim() || undefined,
      });

      // 2. Save or update Product Variant (with size and color empty)
      await dbService.saveVariant({
        ...(editingVariant ? { id: editingVariant.id } : {}),
        product_id: savedProd.id,
        sku: cleanSku,
        barcode: cleanBarcode,
        size: '',
        color: '',
        purchase_price: Math.max(0, Number(formPurchasePrice) || 0),
        selling_price: Math.max(0, Number(formSellingPrice) || 0),
        stock_quantity: Math.max(0, Number(formStockQuantity) || 0),
        min_stock_level: Math.max(0, Number(formMinStock) || 2),
      });

      setShowProductModal(false);
      setEditingVariant(null);
      await loadData();
      onRefreshStats();
      showToast(editingVariant ? 'Product updated successfully!' : 'Product added successfully!', 'success');
    } catch (err: any) {
      console.error('Failed to save product:', err);
      showToast(err.message || 'Failed to save product', 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (v: ProductVariant) => {
    if (!window.confirm(`Are you sure you want to delete "${v.product?.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingVariantId(v.id);
      showToast('Deleting product...', 'info');

      // Delete variant
      await dbService.deleteVariant(v.id);
      if (v.product_id) {
        try {
          await dbService.deleteProduct(v.product_id);
        } catch {
          // In case product has other records, silently proceed
        }
      }

      await loadData();
      onRefreshStats();
      showToast('Product deleted successfully', 'success');
    } catch (err: any) {
      console.error('Failed to delete product:', err);
      showToast(err.message || 'Failed to delete product. It may have sales history.', 'error');
    } finally {
      setDeletingVariantId(null);
    }
  };

  // Batch Print Selected
  const handlePrintBatch = () => {
    const selectedList = variants.filter(v => selectedVariantIds.has(v.id));
    if (selectedList.length === 0) {
      showToast('Please select at least one product using the checkboxes', 'warning');
      return;
    }

    printVariantsBatchLabels(
      selectedList.map(v => ({
        variant: v,
        productName: v.product?.name || 'Product',
        product: v.product,
        copies: 1
      }))
    );
  };

  const toggleSelectAll = () => {
    if (selectedVariantIds.size === paginatedProducts.length && paginatedProducts.length > 0) {
      setSelectedVariantIds(new Set());
    } else {
      const next = new Set<string>(selectedVariantIds);
      paginatedProducts.forEach(p => next.add(p.id));
      setSelectedVariantIds(next);
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set<string>(selectedVariantIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedVariantIds(next);
  };

  // Export PDF
  const handleExportPdf = () => {
    exportTableToPdf({
      moduleName: 'Product Catalog',
      title: 'Products Inventory List',
      dateRange: `Total Products: ${filteredProducts.length}`,
      columns: [
        { header: 'Barcode', key: 'barcode' },
        { header: 'Product Name', key: 'productName' },
        { header: 'Category', key: 'category' },
        { header: 'Cost (৳)', key: 'purchase_price', align: 'right', format: (val) => Number(val).toFixed(2) },
        { header: 'MRP (৳)', key: 'selling_price', align: 'right', format: (val) => Number(val).toFixed(2) },
        { header: 'Stock', key: 'stock_quantity', align: 'center' }
      ],
      data: filteredProducts.map(v => ({
        barcode: v.barcode,
        productName: v.product?.name || 'Product',
        category: v.product?.category || 'General',
        purchase_price: v.purchase_price,
        selling_price: v.selling_price,
        stock_quantity: v.stock_quantity
      }))
    });
  };

  // Export CSV / Excel
  const handleExportCsv = () => {
    const headers = ['Barcode', 'Product Name', 'Category', 'Brand', 'SKU', 'Buy Price', 'MRP', 'Stock Quantity', 'Min Alert'];
    const rows = filteredProducts.map(v => [
      `"${v.barcode || ''}"`,
      `"${(v.product?.name || '').replace(/"/g, '""')}"`,
      `"${(v.product?.category || '').replace(/"/g, '""')}"`,
      `"${(v.product?.brand || '').replace(/"/g, '""')}"`,
      `"${v.sku || ''}"`,
      `"${v.sku || ''}"`,
      v.purchase_price || 0,
      v.selling_price || 0,
      v.stock_quantity || 0,
      v.min_stock_level || 2
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `blue_dream_products_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
      {/* ── TOP KPI STATS BAR ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
        <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Products</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{variants.length}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Stock Units</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{totalStockUnits} pcs</div>
          </div>
        </div>

        {isAdminRole(userRole) && (
          <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Valuation (Cost / Retail)</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                ৳{totalCostValuation.toLocaleString()} <span style={{ fontSize: '12px', color: '#7c3aed', fontWeight: 600 }}>/ ৳{totalRetailValuation.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: lowStockCount > 0 ? '#fef2f2' : '#f8fafc', color: lowStockCount > 0 ? '#dc2626' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Low Stock Alert</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: lowStockCount > 0 ? '#dc2626' : 'var(--text-primary)' }}>
              {lowStockCount} {lowStockCount === 1 ? 'item' : 'items'}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR & CONTROLS ── */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Products Management
            </h2>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Showing {filteredProducts.length} of {variants.length} products
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedVariantIds.size > 0 && (
              <button
                onClick={handlePrintBatch}
                className="btn btn-secondary btn-sm"
                style={{ height: '34px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Printer size={14} />
                <span>Print Barcodes ({selectedVariantIds.size})</span>
              </button>
            )}

            <button
              onClick={handleExportPdf}
              className="btn btn-secondary btn-sm"
              style={{ height: '34px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              title="Export PDF catalog"
            >
              <FileDown size={14} />
              <span>PDF</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="btn btn-secondary btn-sm"
              style={{ height: '34px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              title="Export CSV / Excel"
            >
              <FileDown size={14} />
              <span>Excel (CSV)</span>
            </button>

            <button
              onClick={handleOpenAddProduct}
              className="btn btn-primary btn-sm"
              style={{ height: '34px', fontSize: '12.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Search, Filter & Quick Toggles */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search product name, barcode, SKU, category, brand..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ paddingLeft: '32px', height: '34px', fontSize: '12px' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category Filter Dropdown */}
          <select
            className="form-control"
            value={categoryFilter}
            onChange={e => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ width: 'auto', minWidth: '150px', height: '34px', fontSize: '12px', fontWeight: 600 }}
          >
            <option value="">All Categories ({distinctCategories.length})</option>
            {distinctCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Low Stock Toggle */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: lowStockOnly ? '#dc2626' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', padding: '0 8px' }}>
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={e => {
                setLowStockOnly(e.target.checked);
                setCurrentPage(1);
              }}
              style={{ cursor: 'pointer', accentColor: '#dc2626' }}
            />
            <span>Low Stock Only</span>
          </label>
        </div>
      </div>

      {/* ── PRODUCTS TABLE ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '38px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                  >
                    {selectedVariantIds.size > 0 && selectedVariantIds.size === paginatedProducts.length ? (
                      <CheckSquare size={16} style={{ color: 'var(--color-primary)' }} />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th style={{ width: '120px' }}>Barcode</th>
                <th>Product Name</th>
                <th style={{ width: '150px' }}>Category</th>
                {isAdminRole(userRole) && <th style={{ width: '100px', textAlign: 'right' }}>Buy Price</th>}
                <th style={{ width: '100px', textAlign: 'right' }}>Selling Price</th>
                <th style={{ width: '95px', textAlign: 'center' }}>Stock</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdminRole(userRole) ? 8 : 7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Loading products...
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={isAdminRole(userRole) ? 8 : 7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <Package size={36} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>No products found</div>
                    <div style={{ fontSize: '11.5px', marginTop: '2px' }}>Try adjusting your search or category filter.</div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((v) => {
                  const isLow = v.stock_quantity <= v.min_stock_level;
                  const isSelected = selectedVariantIds.has(v.id);

                  return (
                    <tr key={v.id} style={{ backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.04)' : undefined }}>
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(v.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? 'var(--color-primary)' : 'var(--text-muted)' }}
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>

                      {/* Barcode */}
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                          {v.barcode}
                        </span>
                      </td>

                      {/* Product Name & Brand/SKU */}
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {v.product?.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '1px' }}>
                          {v.sku && <span>SKU: {v.sku}</span>}
                          {v.product?.brand && <span>Brand: {v.product.brand}</span>}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-primary-light, #eff6ff)', padding: '2px 8px', borderRadius: '4px' }}>
                          {v.product?.category || 'General'}
                        </span>
                      </td>

                      {/* Buy Price */}
                      {isAdminRole(userRole) && (
                        <td style={{ textAlign: 'right', fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          ৳{Number(v.purchase_price || 0).toFixed(2)}
                        </td>
                      )}

                      {/* Selling Price */}
                      <td style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        ৳{Number(v.selling_price || 0).toFixed(2)}
                      </td>

                      {/* Stock Quantity */}
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: isLow ? '#fee2e2' : '#f0fdf4',
                          color: isLow ? 'var(--color-danger)' : 'var(--color-success)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          {isLow && <AlertTriangle size={11} />}
                          {v.stock_quantity}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          {/* Print Barcode */}
                          <button
                            type="button"
                            onClick={() => setBarcodeVariantModal(v)}
                            className="btn btn-icon btn-sm"
                            title="Print Barcode Label"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                          >
                            <Printer size={13} />
                          </button>

                          {/* Stock Adjustment */}
                          <button
                            type="button"
                            onClick={() => setStockAdjustVariant(v)}
                            className="btn btn-icon btn-sm"
                            title="Adjust / Restock Quantity"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                          >
                            <SlidersHorizontal size={13} />
                          </button>

                          {/* Edit Product */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditProduct(v)}
                            className="btn btn-icon btn-sm"
                            title="Edit Product"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                          >
                            <Edit3 size={13} />
                          </button>

                          {/* Delete Product */}
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(v)}
                            disabled={deletingVariantId === v.id}
                            className="btn btn-icon btn-sm"
                            title="Delete Product"
                            style={{ width: '28px', height: '28px', padding: 0, color: 'var(--color-danger)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={s => {
            setPageSize(s);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* ── ADD / EDIT PRODUCT MODAL ── */}
      {showProductModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)',
          padding: '16px'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '620px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 0,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {editingVariant ? 'Edit Product' : 'Add New Product'}
                </h3>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {editingVariant ? 'Update product details and pricing' : 'Create a single product entry with inventory details'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Product Name */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>
                    Product Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={formName}
                    onChange={e => handleFormNameChange(e.target.value)}
                    placeholder="e.g. Executive White Cotton Shirt"
                    required
                    style={{ height: '36px', fontSize: '13px' }}
                    autoFocus
                  />
                </div>

                {/* Category & Brand row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Category */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>
                        Category <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(!isCustomCategory);
                          if (!isCustomCategory) {
                            setCustomCategoryInput('');
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                      >
                        {isCustomCategory ? 'Choose Preset' : '+ Custom Category'}
                      </button>
                    </div>

                    {isCustomCategory ? (
                      <input
                        type="text"
                        className="form-control"
                        value={customCategoryInput}
                        onChange={e => setCustomCategoryInput(e.target.value)}
                        placeholder="Type new category name..."
                        required
                        style={{ height: '34px', fontSize: '12.5px' }}
                      />
                    ) : (
                      <select
                        className="form-control"
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value)}
                        required
                        style={{ height: '34px', fontSize: '12.5px', fontWeight: 600 }}
                      >
                        {distinctCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Brand */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>
                      Brand / Label (Optional)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={formBrand}
                      onChange={e => setFormBrand(e.target.value)}
                      placeholder="e.g. Blue Dream, Raymond"
                      style={{ height: '34px', fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                {/* Barcode & SKU Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Barcode */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>
                        Barcode <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      {!editingVariant && (
                        <button
                          type="button"
                          onClick={() => setFormBarcode(getNextGlobalBarcode(variants))}
                          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                        >
                          Auto Generate
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      value={formBarcode}
                      onChange={e => setFormBarcode(e.target.value)}
                      placeholder="000001"
                      required
                      style={{ height: '34px', fontSize: '12.5px', fontFamily: 'monospace', fontWeight: 700 }}
                    />
                  </div>

                  {/* SKU */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>
                        SKU Code
                      </label>
                      {!editingVariant && (
                        <button
                          type="button"
                          onClick={() => setFormSku(generateProductSku(formName, variants.length + 1))}
                          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                        >
                          Auto Generate
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      value={formSku}
                      onChange={e => setFormSku(e.target.value)}
                      placeholder="PRD-STD-26-001"
                      style={{ height: '34px', fontSize: '12.5px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                {/* Pricing: Buy Price & Selling Price */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>
                      Purchase / Buy Cost (৳)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-control"
                      value={formPurchasePrice}
                      onChange={e => setFormPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      style={{ height: '34px', fontSize: '13px', fontWeight: 700 }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px', color: 'var(--color-primary)' }}>
                      Selling MRP (৳) <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-control"
                      value={formSellingPrice}
                      onChange={e => setFormSellingPrice(e.target.value)}
                      placeholder="0.00"
                      required
                      style={{ height: '34px', fontSize: '13px', fontWeight: 800, color: 'var(--color-primary)', borderColor: '#bfdbfe' }}
                    />
                  </div>
                </div>

                {/* Stock Quantity & Low Stock Alert */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>
                      {editingVariant ? 'Stock Quantity (pcs)' : 'Initial Opening Stock (pcs)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={formStockQuantity}
                      onChange={e => setFormStockQuantity(e.target.value)}
                      placeholder="0"
                      style={{ height: '34px', fontSize: '13px', fontWeight: 700 }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>
                      Min Stock Alert (pcs)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={formMinStock}
                      onChange={e => setFormMinStock(e.target.value)}
                      placeholder="5"
                      style={{ height: '34px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>
                    Notes / Description (Optional)
                  </label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Additional details, fabric, rack location, etc."
                    style={{ fontSize: '12px', resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div style={{
                padding: '12px 18px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                backgroundColor: '#f8fafc'
              }}>
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="btn btn-secondary btn-sm"
                  style={{ height: '34px', padding: '0 16px', fontSize: '12px' }}
                  disabled={savingProduct}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ height: '34px', padding: '0 20px', fontSize: '12.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  disabled={savingProduct}
                >
                  {savingProduct ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>{editingVariant ? 'Save Changes' : 'Create Product'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── STOCK ADJUSTMENT MODAL ── */}
      {stockAdjustVariant && (
        <StockAdjustmentModal
          variant={stockAdjustVariant}
          onSuccess={() => {
            loadData();
            onRefreshStats();
          }}
          onClose={() => setStockAdjustVariant(null)}
        />
      )}

      {/* ── BARCODE LABEL MODAL ── */}
      {barcodeVariantModal && (
        <BarcodeLabelModal
          variant={barcodeVariantModal}
          productName={barcodeVariantModal.product?.name || 'Product'}
          product={barcodeVariantModal.product}
          onClose={() => setBarcodeVariantModal(null)}
        />
      )}
    </div>
  );
};
