import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../dbService';
import type { ProductVariant } from '../store';
import { Calendar, FileDown, Search, Eye } from 'lucide-react';
import { Pagination } from './Pagination';
import { InvoicePrintModal, type InvoiceData } from './InvoicePrintModal';
import { exportTableToPdf } from '../utils/pdfExport';
import { formatDateDDMMYYYY, formatTimeAMPM } from '../utils/dateUtils';
import { isAdminRole } from '../roleUtils';

type DateFilter = 'today' | 'week' | 'month' | 'month_select' | 'custom' | 'all';
type ReportType = 'BY_DATE' | 'BY_PRODUCT' | 'BY_CATEGORY' | 'BY_INVOICE';
type ProductSortKey = 'sales' | 'profit' | 'units' | 'stock' | 'name';
type CategorySortKey = 'sales' | 'profit' | 'units' | 'stock' | 'products' | 'name';
type InvoiceSortKey = 'date_desc' | 'date_asc' | 'sales_desc' | 'profit_desc' | 'due_desc';

export interface InvoiceStat {
  saleId: string;
  invoiceCode: string;
  saleDate: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  itemsCount: number;
  unitsSold: number;
  unitsReturned: number;
  grossSales: number;
  discount: number;
  payable: number;
  paidAmount: number;
  dueAmount: number;
  refundAmount: number;
  totalCogs: number;
  profit: number;
  marginPct: number;
  rawSale: any;
}

interface ReportsViewProps {
  userRole?: string;
}

interface MotherProductStat {
  productId: string;
  productName: string;
  category: string;
  brand: string;
  variantsCount: number;
  currentStock: number;
  unitsSold: number;
  unitsReturned: number;
  netUnitsSold: number;
  grossSales: number;
  discount: number;
  refundAmount: number;
  netSales: number;
  payable: number;
  paidAmount: number;
  dueAmount: number;
  totalCogs: number;
  productProfit: number;
  marginPct: number;
  orderCount: number;
}

interface CategoryStat {
  category: string;
  productsCount: number;
  variantsCount: number;
  currentStock: number;
  stockValuation: number;
  unitsSold: number;
  unitsReturned: number;
  netUnitsSold: number;
  grossSales: number;
  discount: number;
  refundAmount: number;
  netSales: number;
  payable: number;
  paidAmount: number;
  dueAmount: number;
  totalCogs: number;
  categoryProfit: number;
  marginPct: number;
  orderCount: number;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ userRole }) => {
  const [sales, setSales] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [paymentCollections, setPaymentCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Report mode & Date filter state
  const [reportType, setReportType] = useState<ReportType>('BY_DATE');
  const [filter, setFilter] = useState<DateFilter>('today');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Product report search & sorting
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSortBy, setProductSortBy] = useState<ProductSortKey>('sales');

  // Category report search & sorting
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [categorySortBy, setCategorySortBy] = useState<CategorySortKey>('sales');

  // Invoice report search & sorting & filter
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoiceSortBy, setInvoiceSortBy] = useState<InvoiceSortKey>('date_desc');
  const [invoicePaymentFilter, setInvoicePaymentFilter] = useState<string>('ALL');

  // Selected invoice for detail/print modal
  const [selectedSaleForModal, setSelectedSaleForModal] = useState<any | null>(null);
  const [modalSaleItems, setModalSaleItems] = useState<any[]>([]);
  const [modalItemsLoading, setModalItemsLoading] = useState(false);

  const handleOpenInvoiceModal = async (rawSale: any) => {
    setSelectedSaleForModal(rawSale);
    try {
      setModalItemsLoading(true);
      const items = await dbService.getSaleItems(rawSale.id);
      setModalSaleItems(items);
    } catch (e) {
      console.error('Failed to load sale details for modal', e);
      setModalSaleItems(rawSale.sale_items || []);
    } finally {
      setModalItemsLoading(false);
    }
  };

  const invoiceModalData: InvoiceData | null = selectedSaleForModal ? {
    invoiceId: selectedSaleForModal.id,
    invoiceCode: selectedSaleForModal.invoice_code,
    saleDate: selectedSaleForModal.sale_date,
    paymentMethod: selectedSaleForModal.payment_method,
    customerPhone: selectedSaleForModal.customer_phone,
    customerName: selectedSaleForModal.customer_name,
    guarantorName: selectedSaleForModal.guarantor_name,
    guarantorPhone: selectedSaleForModal.guarantor_phone,
    totalAmount: selectedSaleForModal.total_amount,
    discountAmount: selectedSaleForModal.discount_amount || 0,
    payableAmount: selectedSaleForModal.payable_amount,
    receivedAmount: selectedSaleForModal.received_amount !== undefined && selectedSaleForModal.received_amount !== null ? selectedSaleForModal.received_amount : selectedSaleForModal.payable_amount,
    dueAmount: selectedSaleForModal.due_amount || 0,
    changeAmount: selectedSaleForModal.change_amount || 0,
    items: modalSaleItems.map(item => ({
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = async (force = true) => {
    try {
      setLoading(true);
      const [salesList, itemsList, variantList, expenseList, collectionsList] = await Promise.all([
        dbService.getSales(force),
        dbService.getSaleItemsDetailed(force),
        dbService.getVariants(force),
        dbService.getExpenses(force),
        dbService.getPaymentCollections(force)
      ]);

      setSales(salesList || []);
      setSaleItems(itemsList || []);
      setVariants(variantList || []);
      setExpenses(expenseList || []);
      setPaymentCollections(collectionsList || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [reportType]);

  // Filter helper
  const filterByDate = (dateStr: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
      case 'today':
        return date >= startOfToday;
      case 'week':
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return date >= sevenDaysAgo;
      case 'month':
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return date >= thirtyDaysAgo;
      case 'month_select':
        if (selectedMonth) {
          const [yStr, mStr] = selectedMonth.split('-');
          const year = Number(yStr);
          const month = Number(mStr) - 1;
          return date.getFullYear() === year && date.getMonth() === month;
        }
        return true;
      case 'custom':
        if (startDate && endDate) {
          const start = new Date(startDate + 'T00:00:00');
          const end = new Date(endDate + 'T23:59:59.999');
          return date >= start && date <= end;
        } else if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          return date >= start;
        } else if (endDate) {
          const end = new Date(endDate + 'T23:59:59.999');
          return date <= end;
        }
        return true;
      case 'all':
      default:
        return true;
    }
  };

  // Filtered datasets based on date filter
  const filteredSales = useMemo(() => sales.filter(s => filterByDate(s.sale_date)), [sales, filter, selectedMonth, startDate, endDate]);
  const filteredItems = useMemo(() => saleItems.filter(si => si.sale && filterByDate(si.sale.sale_date)), [saleItems, filter, selectedMonth, startDate, endDate]);
  const filteredExpenses = useMemo(() => expenses.filter(exp => filterByDate(exp.expense_date)), [expenses, filter, selectedMonth, startDate, endDate]);

  // Fast variant lookup map
  const variantsMap = useMemo(() => new Map(variants.map(v => [v.id, v])), [variants]);

  // Overall Business KPIs
  let totalGrossSales = 0;
  let totalReturnsMerchandise = 0;
  let totalReturnedUnits = 0;
  let totalSoldUnits = 0;
  let totalCogs = 0;

  filteredItems.forEach(si => {
    const isReturn = si.sale_type === 'RETURN' || si.is_returned;
    const v = variantsMap.get(si.variant_id);
    const unitCost = Number(v?.purchase_price || 0);
    const qty = Number(si.quantity || 0);
    const itemAmount = Math.abs(Number(si.total_price || (qty * Number(si.unit_price || 0)) || 0));

    if (isReturn) {
      totalReturnsMerchandise += itemAmount;
      totalReturnedUnits += qty;
      totalCogs -= qty * unitCost;
    } else {
      totalGrossSales += itemAmount;
      totalSoldUnits += qty;
      totalCogs += qty * unitCost;
    }
  });

  const totalNetSales = totalGrossSales - totalReturnsMerchandise;
  const totalDiscount = useMemo(() => filteredSales.reduce((acc, s) => acc + Number(s.discount_amount || 0), 0), [filteredSales]);

  // Group payment collections by sale_id
  const collectionsBySaleId = useMemo(() => {
    const map = new Map<string, any[]>();
    paymentCollections.forEach(pc => {
      const arr = map.get(pc.sale_id) || [];
      arr.push(pc);
      map.set(pc.sale_id, arr);
    });
    return map;
  }, [paymentCollections]);

  // Payment collections matching the date filter period
  const filteredCollections = useMemo(() => {
    return paymentCollections.filter(pc => filterByDate(pc.collection_date));
  }, [paymentCollections, filter, selectedMonth, startDate, endDate]);

  const totalDueCollectedAll = useMemo(() => {
    return filteredCollections
      .filter(pc => pc.collection_type === 'DUE_COLLECTION')
      .reduce((sum, pc) => sum + Number(pc.amount || 0), 0);
  }, [filteredCollections]);

  let totalActualCashRefunded = 0;
  let totalPayable = 0;
  let totalLegacyPaid = 0;

  filteredSales.forEach(s => {
    const payable = Number(s.payable_amount || 0);
    if (payable < 0) {
      totalActualCashRefunded += Math.abs(payable);
    } else {
      totalPayable += payable;
      if (!collectionsBySaleId.has(s.id)) {
        const paid = Number(s.received_amount !== undefined && s.received_amount !== null ? s.received_amount : (payable > 0 ? payable : 0));
        totalLegacyPaid += paid;
      }
    }
  });

  const totalCollectionsPaid = filteredCollections.reduce((sum, pc) => sum + Number(pc.amount || 0), 0);
  const totalPaid = totalLegacyPaid + totalCollectionsPaid;

  const totalDue = Math.max(0, totalPayable - totalPaid);
  const totalProfit = (totalPaid - totalActualCashRefunded) - totalCogs;
  const totalExpenses = useMemo(() => filteredExpenses.reduce((acc, exp) => acc + Number(exp.amount || 0), 0), [filteredExpenses]);
  const totalStockUnits = useMemo(() => variants.reduce((acc, v) => acc + (v.stock_quantity || 0), 0), [variants]);
  const totalStockValuation = useMemo(() => variants.reduce((acc, v) => acc + ((v.stock_quantity || 0) * (v.purchase_price || 0)), 0), [variants]);
  const overallNetProfit = totalProfit - totalExpenses;

  const getDateKey = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatDateDisplay = (dateKey: string) => {
    try {
      const parts = dateKey.split('-');
      if (parts.length === 3) {
        const day = parts[2].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[0];
        return `${day}/${month}/${year}`;
      }
      return formatDateDDMMYYYY(dateKey);
    } catch {
      return formatDateDDMMYYYY(dateKey);
    }
  };

  const formatAmount = (val: number | string) => {
    const num = Number(val || 0);
    return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
  };

  // ----------------------------------------------------
  // 1. DATE-WISE BREAKDOWN DATA
  // ----------------------------------------------------
  const dateStatsList = useMemo(() => {
    const dateStatsMap: {
      [key: string]: {
        dateKey: string;
        orderCount: number;
        unitsSold: number;
        unitsReturned: number;
        grossSales: number;
        returnsAmount: number;
        netSales: number;
        discount: number;
        payable: number;
        paidAmount: number;
        dueCollected: number;
        dueAmount: number;
        refundAmount: number;
        totalCogs: number;
        productProfit: number;
        expenses: number;
        netProfit: number;
      }
    } = {};

    const getOrCreateDateStat = (dateKey: string) => {
      if (!dateStatsMap[dateKey]) {
        dateStatsMap[dateKey] = {
          dateKey,
          orderCount: 0,
          unitsSold: 0,
          unitsReturned: 0,
          grossSales: 0,
          returnsAmount: 0,
          netSales: 0,
          discount: 0,
          payable: 0,
          paidAmount: 0,
          dueCollected: 0,
          dueAmount: 0,
          refundAmount: 0,
          totalCogs: 0,
          productProfit: 0,
          expenses: 0,
          netProfit: 0
        };
      }
      return dateStatsMap[dateKey];
    };

    filteredSales.forEach(s => {
      const key = getDateKey(s.sale_date);
      if (!key) return;
      const stat = getOrCreateDateStat(key);
      const payable = Number(s.payable_amount || 0);
      stat.orderCount += 1;
      stat.discount += Number(s.discount_amount || 0);
      if (payable < 0) {
        stat.refundAmount += Math.abs(payable);
      } else {
        stat.payable += payable;
        if (!collectionsBySaleId.has(s.id)) {
          const paid = Number(s.received_amount !== undefined && s.received_amount !== null ? s.received_amount : (payable > 0 ? payable : 0));
          stat.paidAmount += paid;
          stat.dueAmount += Math.max(0, payable - paid);
        } else {
          stat.dueAmount += Number(s.due_amount || 0);
        }
      }
    });

    // Attribute payment collections to the date they were received
    paymentCollections.forEach(pc => {
      if (!filterByDate(pc.collection_date)) return;
      const key = getDateKey(pc.collection_date);
      if (!key) return;
      const stat = getOrCreateDateStat(key);
      const amt = Number(pc.amount || 0);
      stat.paidAmount += amt;
      if (pc.collection_type === 'DUE_COLLECTION') {
        stat.dueCollected += amt;
      }
    });

    filteredItems.forEach(si => {
      if (!si.sale?.sale_date) return;
      const key = getDateKey(si.sale.sale_date);
      if (!key) return;
      const stat = getOrCreateDateStat(key);
      const isReturn = si.sale_type === 'RETURN' || si.is_returned;
      const v = variantsMap.get(si.variant_id);
      const unitCost = Number(v?.purchase_price || 0);
      const qty = Number(si.quantity || 0);
      const itemAmount = Math.abs(Number(si.total_price || (qty * Number(si.unit_price || 0)) || 0));

      if (isReturn) {
        stat.unitsReturned += qty;
        stat.returnsAmount += itemAmount;
        stat.totalCogs -= qty * unitCost;
      } else {
        stat.unitsSold += qty;
        stat.grossSales += itemAmount;
        stat.totalCogs += qty * unitCost;
      }
    });

    filteredExpenses.forEach(exp => {
      const key = getDateKey(exp.expense_date);
      if (!key) return;
      const stat = getOrCreateDateStat(key);
      stat.expenses += Number(exp.amount || 0);
    });

    Object.values(dateStatsMap).forEach(stat => {
      stat.netSales = stat.grossSales - stat.returnsAmount;
      stat.productProfit = (stat.paidAmount - stat.refundAmount) - stat.totalCogs;
      stat.netProfit = stat.productProfit - stat.expenses;
    });

    return Object.values(dateStatsMap).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredSales, filteredItems, filteredExpenses, variantsMap, paymentCollections, collectionsBySaleId, filter, selectedMonth, startDate, endDate]);

  // ----------------------------------------------------
  // 2. PRODUCT-WISE BREAKDOWN DATA
  // ----------------------------------------------------
  const productStatsList = useMemo(() => {
    // Map of product id/name -> aggregated metrics
    const motherProductMap = new Map<string, MotherProductStat & { orderSet: Set<string> }>();

    // Step A: Calculate current stock & metrics for all products in database
    variants.forEach(v => {
      const motherId = v.product_id || v.product?.id || `name_${v.product?.name || 'unknown'}`;
      const motherName = v.product?.name || 'Unknown Product';
      const category = v.product?.category || '-';
      const brand = v.product?.brand || '-';

      if (!motherProductMap.has(motherId)) {
        motherProductMap.set(motherId, {
          productId: motherId,
          productName: motherName,
          category,
          brand,
          variantsCount: 0,
          currentStock: 0,
          unitsSold: 0,
          unitsReturned: 0,
          netUnitsSold: 0,
          grossSales: 0,
          discount: 0,
          refundAmount: 0,
          netSales: 0,
          payable: 0,
          paidAmount: 0,
          dueAmount: 0,
          totalCogs: 0,
          productProfit: 0,
          marginPct: 0,
          orderCount: 0,
          orderSet: new Set<string>()
        });
      }

      const entry = motherProductMap.get(motherId)!;
      entry.variantsCount += 1;
      entry.currentStock += Number(v.stock_quantity || 0);
    });

    // Step B: Aggregate sold and returned items in the selected date range
    filteredItems.forEach(si => {
      const v = variantsMap.get(si.variant_id);
      const motherId = v?.product_id || v?.product?.id || `name_${v?.product?.name || 'unknown'}`;
      const motherName = v?.product?.name || 'Unknown Product';
      const category = v?.product?.category || '-';
      const brand = v?.product?.brand || '-';

      if (!motherProductMap.has(motherId)) {
        motherProductMap.set(motherId, {
          productId: motherId,
          productName: motherName,
          category,
          brand,
          variantsCount: 1,
          currentStock: 0,
          unitsSold: 0,
          unitsReturned: 0,
          netUnitsSold: 0,
          grossSales: 0,
          discount: 0,
          refundAmount: 0,
          netSales: 0,
          payable: 0,
          paidAmount: 0,
          dueAmount: 0,
          totalCogs: 0,
          productProfit: 0,
          marginPct: 0,
          orderCount: 0,
          orderSet: new Set<string>()
        });
      }

      const entry = motherProductMap.get(motherId)!;
      const isReturn = si.sale_type === 'RETURN' || si.is_returned;
      const qty = Number(si.quantity || 0);
      const unitPrice = Number(si.unit_price || 0);
      const unitCost = Number(v?.purchase_price || 0);
      const totalItemAmount = Math.abs(Number(si.total_price || (qty * unitPrice) || 0));

      if (si.sale_id) {
        entry.orderSet.add(si.sale_id);
      }

      if (isReturn) {
        entry.unitsReturned += qty;
        entry.refundAmount += totalItemAmount;
        entry.totalCogs -= qty * unitCost;
        entry.paidAmount -= totalItemAmount;
      } else {
        entry.unitsSold += qty;
        entry.grossSales += totalItemAmount;
        entry.totalCogs += qty * unitCost;

        let itemDiscount = 0;
        if (si.sale?.discount_amount && Number(si.sale?.total_amount || 0) > 0) {
          itemDiscount = (totalItemAmount / Number(si.sale.total_amount)) * Number(si.sale.discount_amount);
          entry.discount += itemDiscount;
        }

        const itemPayable = totalItemAmount - itemDiscount;
        const s = si.sale;
        const salePayable = Number(s?.payable_amount || 0);
        const salePaid = Number(s?.received_amount !== undefined && s?.received_amount !== null ? s.received_amount : s?.payable_amount || 0);
        const paidRatio = salePayable > 0 ? Math.min(1, Math.max(0, salePaid / salePayable)) : 1;
        const itemPaid = itemPayable * paidRatio;
        const itemDue = Math.max(0, itemPayable - itemPaid);

        entry.paidAmount += itemPaid;
        entry.dueAmount += itemDue;
      }
    });

    // Step C: Compute final net totals and margins
    const list: MotherProductStat[] = [];
    motherProductMap.forEach(item => {
      item.netUnitsSold = item.unitsSold - item.unitsReturned;
      item.netSales = item.grossSales - item.refundAmount;
      item.payable = item.netSales - item.discount;
      item.productProfit = item.paidAmount - item.totalCogs;
      item.orderCount = item.orderSet.size;
      item.marginPct = item.paidAmount > 0 ? (item.productProfit / item.paidAmount) * 100 : 0;

      // Only include if it has sales activity in selected range or if looking at All Time
      if (item.unitsSold > 0 || item.unitsReturned > 0 || filter === 'all') {
        list.push({
          productId: item.productId,
          productName: item.productName,
          category: item.category,
          brand: item.brand,
          variantsCount: item.variantsCount,
          currentStock: item.currentStock,
          unitsSold: item.unitsSold,
          unitsReturned: item.unitsReturned,
          netUnitsSold: item.netUnitsSold,
          grossSales: item.grossSales,
          discount: item.discount,
          refundAmount: item.refundAmount,
          netSales: item.netSales,
          payable: item.payable,
          paidAmount: item.paidAmount,
          dueAmount: item.dueAmount,
          totalCogs: item.totalCogs,
          productProfit: item.productProfit,
          marginPct: item.marginPct,
          orderCount: item.orderCount
        });
      }
    });

    return list;
  }, [variants, filteredItems, variantsMap, filter]);

  // Filtered & Sorted Product Stats
  const filteredProductStats = useMemo(() => {
    let result = productStatsList;
    const q = productSearchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(p =>
        p.productName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => {
      switch (productSortBy) {
        case 'sales':
          return b.netSales - a.netSales;
        case 'profit':
          return b.productProfit - a.productProfit;
        case 'units':
          return b.netUnitsSold - a.netUnitsSold;
        case 'stock':
          return a.currentStock - b.currentStock;
        case 'name':
          return a.productName.localeCompare(b.productName);
        default:
          return b.netSales - a.netSales;
      }
    });
  }, [productStatsList, productSearchQuery, productSortBy]);

  // ----------------------------------------------------
  // 3. CATEGORY-WISE BREAKDOWN DATA
  // ----------------------------------------------------
  const categoryStatsList = useMemo(() => {
    const categoryMap = new Map<string, CategoryStat & { orderSet: Set<string>; productSet: Set<string> }>();

    // Step A: Calculate current stock, variants count, and unique products count for all categories in database
    variants.forEach(v => {
      const rawCat = v.product?.category?.trim();
      const catName = rawCat && rawCat.length > 0 ? rawCat : 'Uncategorized';
      const motherId = v.product_id || v.product?.id || `name_${v.product?.name || 'unknown'}`;

      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, {
          category: catName,
          productsCount: 0,
          variantsCount: 0,
          currentStock: 0,
          stockValuation: 0,
          unitsSold: 0,
          unitsReturned: 0,
          netUnitsSold: 0,
          grossSales: 0,
          discount: 0,
          refundAmount: 0,
          netSales: 0,
          payable: 0,
          paidAmount: 0,
          dueAmount: 0,
          totalCogs: 0,
          categoryProfit: 0,
          marginPct: 0,
          orderCount: 0,
          orderSet: new Set<string>(),
          productSet: new Set<string>()
        });
      }

      const entry = categoryMap.get(catName)!;
      entry.variantsCount += 1;
      const stock = Number(v.stock_quantity || 0);
      const buyPrice = Number(v.purchase_price || 0);
      entry.currentStock += stock;
      entry.stockValuation += stock * buyPrice;
      entry.productSet.add(motherId);
    });

    // Step B: Aggregate sold and returned items in the selected date range
    filteredItems.forEach(si => {
      const v = variantsMap.get(si.variant_id);
      const rawCat = v?.product?.category?.trim();
      const catName = rawCat && rawCat.length > 0 ? rawCat : 'Uncategorized';
      const motherId = v?.product_id || v?.product?.id || `name_${v?.product?.name || 'unknown'}`;

      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, {
          category: catName,
          productsCount: 0,
          variantsCount: 0,
          currentStock: 0,
          stockValuation: 0,
          unitsSold: 0,
          unitsReturned: 0,
          netUnitsSold: 0,
          grossSales: 0,
          discount: 0,
          refundAmount: 0,
          netSales: 0,
          payable: 0,
          paidAmount: 0,
          dueAmount: 0,
          totalCogs: 0,
          categoryProfit: 0,
          marginPct: 0,
          orderCount: 0,
          orderSet: new Set<string>(),
          productSet: new Set<string>()
        });
      }

      const entry = categoryMap.get(catName)!;
      if (motherId) {
        entry.productSet.add(motherId);
      }

      const isReturn = si.sale_type === 'RETURN' || si.is_returned;
      const qty = Number(si.quantity || 0);
      const unitPrice = Number(si.unit_price || 0);
      const unitCost = Number(v?.purchase_price || 0);
      const totalItemAmount = Math.abs(Number(si.total_price || (qty * unitPrice) || 0));

      if (si.sale_id) {
        entry.orderSet.add(si.sale_id);
      }

      if (isReturn) {
        entry.unitsReturned += qty;
        entry.refundAmount += totalItemAmount;
        entry.totalCogs -= qty * unitCost;
        entry.paidAmount -= totalItemAmount;
      } else {
        entry.unitsSold += qty;
        entry.grossSales += totalItemAmount;
        entry.totalCogs += qty * unitCost;

        let itemDiscount = 0;
        if (si.sale?.discount_amount && Number(si.sale?.total_amount || 0) > 0) {
          itemDiscount = (totalItemAmount / Number(si.sale.total_amount)) * Number(si.sale.discount_amount);
          entry.discount += itemDiscount;
        }

        const itemPayable = totalItemAmount - itemDiscount;
        const s = si.sale;
        const salePayable = Number(s?.payable_amount || 0);
        const salePaid = Number(s?.received_amount !== undefined && s?.received_amount !== null ? s.received_amount : s?.payable_amount || 0);
        const paidRatio = salePayable > 0 ? Math.min(1, Math.max(0, salePaid / salePayable)) : 1;
        const itemPaid = itemPayable * paidRatio;
        const itemDue = Math.max(0, itemPayable - itemPaid);

        entry.paidAmount += itemPaid;
        entry.dueAmount += itemDue;
      }
    });

    // Step C: Compute final net totals and margins
    const list: CategoryStat[] = [];
    categoryMap.forEach(item => {
      item.productsCount = item.productSet.size;
      item.netUnitsSold = item.unitsSold - item.unitsReturned;
      item.netSales = item.grossSales - item.refundAmount;
      item.payable = item.netSales - item.discount;
      item.categoryProfit = item.paidAmount - item.totalCogs;
      item.orderCount = item.orderSet.size;
      item.marginPct = item.paidAmount > 0 ? (item.categoryProfit / item.paidAmount) * 100 : 0;

      // Only include if it has sales activity in selected range or if looking at All Time
      if (item.unitsSold > 0 || item.unitsReturned > 0 || filter === 'all') {
        list.push({
          category: item.category,
          productsCount: item.productsCount,
          variantsCount: item.variantsCount,
          currentStock: item.currentStock,
          stockValuation: item.stockValuation,
          unitsSold: item.unitsSold,
          unitsReturned: item.unitsReturned,
          netUnitsSold: item.netUnitsSold,
          grossSales: item.grossSales,
          discount: item.discount,
          refundAmount: item.refundAmount,
          netSales: item.netSales,
          payable: item.payable,
          paidAmount: item.paidAmount,
          dueAmount: item.dueAmount,
          totalCogs: item.totalCogs,
          categoryProfit: item.categoryProfit,
          marginPct: item.marginPct,
          orderCount: item.orderCount
        });
      }
    });

    return list;
  }, [variants, filteredItems, variantsMap, filter]);

  // Filtered & Sorted Category Stats
  const filteredCategoryStats = useMemo(() => {
    let result = categoryStatsList;
    const q = categorySearchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(c => c.category.toLowerCase().includes(q));
    }

    return result.sort((a, b) => {
      switch (categorySortBy) {
        case 'sales':
          return b.netSales - a.netSales;
        case 'profit':
          return b.categoryProfit - a.categoryProfit;
        case 'units':
          return b.netUnitsSold - a.netUnitsSold;
        case 'products':
          return b.productsCount - a.productsCount;
        case 'stock':
          return a.currentStock - b.currentStock;
        case 'name':
          return a.category.localeCompare(b.category);
        default:
          return b.netSales - a.netSales;
      }
    });
  }, [categoryStatsList, categorySearchQuery, categorySortBy]);

  // ----------------------------------------------------
  // 4. INVOICE-WISE BREAKDOWN DATA
  // ----------------------------------------------------
  const invoiceStatsList = useMemo(() => {
    const itemsMap = new Map<string, any[]>();
    filteredItems.forEach(si => {
      if (si.sale_id) {
        const arr = itemsMap.get(si.sale_id) || [];
        arr.push(si);
        itemsMap.set(si.sale_id, arr);
      }
    });

    return filteredSales.map(s => {
      const saleId = s.id;
      const invoiceCode = s.invoice_code || (saleId ? saleId.substring(0, 8).toUpperCase() : 'UNKNOWN');
      const saleDate = s.sale_date;
      const customerName = s.customer_name || '';
      const customerPhone = s.customer_phone || '';
      const paymentMethod = s.payment_method || 'CASH';

      const items = s.sale_items && s.sale_items.length > 0 ? s.sale_items : (itemsMap.get(saleId) || []);

      let unitsSold = 0;
      let unitsReturned = 0;
      let calculatedGross = 0;
      let invoiceCogs = 0;

      items.forEach((si: any) => {
        const isReturn = si.sale_type === 'RETURN' || si.is_returned;
        const v = variantsMap.get(si.variant_id) || si.variant;
        const unitCost = Number(v?.purchase_price || 0);
        const qty = Number(si.quantity || 0);
        const itemAmount = Math.abs(Number(si.total_price || (qty * Number(si.unit_price || 0)) || 0));

        if (isReturn) {
          unitsReturned += qty;
          invoiceCogs -= qty * unitCost;
        } else {
          unitsSold += qty;
          calculatedGross += itemAmount;
          invoiceCogs += qty * unitCost;
        }
      });

      const grossSales = calculatedGross > 0 ? calculatedGross : Number(s.total_amount || 0);
      const discount = Number(s.discount_amount || 0);
      const payable = Number(s.payable_amount || 0);
      const paidAmount = Number(s.received_amount !== undefined && s.received_amount !== null ? s.received_amount : (payable > 0 ? payable : 0));
      const dueAmount = Math.max(0, payable - paidAmount);
      const refundAmount = payable < 0 ? Math.abs(payable) : 0;
      const profit = (paidAmount - refundAmount) - invoiceCogs;
      const marginPct = paidAmount > 0 ? (profit / paidAmount) * 100 : 0;

      return {
        saleId,
        invoiceCode,
        saleDate,
        customerName,
        customerPhone,
        paymentMethod,
        itemsCount: items.length,
        unitsSold,
        unitsReturned,
        grossSales,
        discount,
        payable,
        paidAmount,
        dueAmount,
        refundAmount,
        totalCogs: invoiceCogs,
        profit,
        marginPct,
        rawSale: s
      };
    });
  }, [filteredSales, filteredItems, variantsMap]);

  // Filtered & Sorted Invoice Stats
  const filteredInvoiceStats = useMemo(() => {
    let result = invoiceStatsList;
    const q = invoiceSearchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(inv => {
        const matchesCode = inv.invoiceCode.toLowerCase().includes(q) || inv.saleId.toLowerCase().includes(q);
        const matchesCustomer = inv.customerName.toLowerCase().includes(q) || inv.customerPhone.includes(q);
        const matchesMethod = inv.paymentMethod.toLowerCase().includes(q);
        const items = inv.rawSale?.sale_items || [];
        const matchesItem = items.some((si: any) => {
          const v = variantsMap.get(si.variant_id) || si.variant;
          return v?.barcode?.toLowerCase().includes(q) ||
            v?.sku?.toLowerCase().includes(q) ||
            v?.product?.name?.toLowerCase().includes(q);
        });
        return matchesCode || matchesCustomer || matchesMethod || matchesItem;
      });
    }

    if (invoicePaymentFilter !== 'ALL') {
      result = result.filter(inv => inv.paymentMethod.toUpperCase() === invoicePaymentFilter.toUpperCase());
    }

    return [...result].sort((a, b) => {
      switch (invoiceSortBy) {
        case 'date_asc':
          return new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime();
        case 'sales_desc':
          return b.grossSales - a.grossSales;
        case 'profit_desc':
          return b.profit - a.profit;
        case 'due_desc':
          return b.dueAmount - a.dueAmount;
        case 'date_desc':
        default:
          return new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime();
      }
    });
  }, [invoiceStatsList, invoiceSearchQuery, invoicePaymentFilter, invoiceSortBy, variantsMap]);

  // PDF Export Handler
  const handleDownloadPdf = () => {
    const dateRangeLabel = filter === 'all'
      ? 'All Time'
      : filter === 'week'
        ? 'This Week'
        : filter === 'month'
          ? 'This Month'
          : filter === 'month_select'
            ? `Month: ${selectedMonth}`
            : filter === 'custom'
              ? `${startDate || 'Start'} to ${endDate || 'End'}`
              : 'Today';

    if (reportType === 'BY_INVOICE') {
      const totalInvGross = filteredInvoiceStats.reduce((sum, inv) => sum + inv.grossSales, 0);
      const totalInvDiscount = filteredInvoiceStats.reduce((sum, inv) => sum + inv.discount, 0);
      const totalInvPayable = filteredInvoiceStats.reduce((sum, inv) => sum + inv.payable, 0);
      const totalInvPaid = filteredInvoiceStats.reduce((sum, inv) => sum + inv.paidAmount, 0);
      const totalInvDue = Math.max(0, totalInvPayable - totalInvPaid);
      const totalInvCogs = filteredInvoiceStats.reduce((sum, inv) => sum + inv.totalCogs, 0);
      const totalInvProfit = filteredInvoiceStats.reduce((sum, inv) => sum + inv.profit, 0);

      exportTableToPdf({
        moduleName: 'Reports (By Invoice)',
        title: 'Invoice Sales & Profitability Report',
        dateRange: dateRangeLabel,
        summaryCards: [
          { label: 'Total Invoices', value: String(filteredInvoiceStats.length) },
          { label: 'Gross Sales', value: `Tk ${formatAmount(totalInvGross)}` },
          { label: 'Discount', value: `Tk ${formatAmount(totalInvDiscount)}` },
          { label: 'Total Payable', value: `Tk ${formatAmount(totalInvPayable)}` },
          { label: 'Paid Amount', value: `Tk ${formatAmount(totalInvPaid)}` },
          { label: 'Due Amount', value: `Tk ${formatAmount(totalInvDue)}` },
          { label: 'Cost of Goods (COGS)', value: `Tk ${formatAmount(totalInvCogs)}` },
          { label: 'Invoice Profit', value: `Tk ${formatAmount(totalInvProfit)}` }
        ],
        columns: [
          { header: 'Invoice #', key: 'invoiceCode', format: (v) => `#${v}` },
          { header: 'Date', key: 'saleDate', format: (v) => formatDateDDMMYYYY(v) },
          { header: 'Customer', key: 'customerName', format: (v, r) => v || r?.customerPhone || 'Walk-in' },
          { header: 'Method', key: 'paymentMethod', align: 'center' },
          { header: 'Units (Sold/Ret)', key: 'unitsSold', align: 'center', format: (v, r) => `${v} / ${r?.unitsReturned || 0}` },
          { header: 'Gross Sales', key: 'grossSales', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Discount', key: 'discount', align: 'right', format: (v) => v > 0 ? `Tk ${formatAmount(v)}` : '-' },
          { header: 'Total Payable', key: 'payable', align: 'right', format: (v, r) => `Tk ${formatAmount(v)} (Paid: ${formatAmount(r?.paidAmount || 0)})` },
          { header: 'Cost of Goods (COGS)', key: 'totalCogs', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Profit', key: 'profit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` }
        ],
        data: filteredInvoiceStats
      });
    } else if (reportType === 'BY_CATEGORY') {
      const totalUnitsSold = filteredCategoryStats.reduce((sum, c) => sum + c.netUnitsSold, 0);
      const totalCatSales = filteredCategoryStats.reduce((sum, c) => sum + c.netSales, 0);
      const totalCatDiscount = filteredCategoryStats.reduce((sum, c) => sum + c.discount, 0);
      const totalCatPayable = filteredCategoryStats.reduce((sum, c) => sum + c.payable, 0);
      const totalCatPaid = filteredCategoryStats.reduce((sum, c) => sum + c.paidAmount, 0);
      const totalCatDue = Math.max(0, totalCatPayable - totalCatPaid);
      const totalCatProfit = filteredCategoryStats.reduce((sum, c) => sum + c.categoryProfit, 0);

      exportTableToPdf({
        moduleName: 'Reports (By Category)',
        title: 'Category Sales Performance Report',
        dateRange: dateRangeLabel,
        summaryCards: [
          { label: 'Categories', value: String(filteredCategoryStats.length) },
          { label: 'Units Sold', value: `${totalUnitsSold} pcs` },
          { label: 'Total Sales', value: `Tk ${formatAmount(totalCatSales)}` },
          { label: 'Total Discount', value: `Tk ${formatAmount(totalCatDiscount)}` },
          { label: 'Total Payable', value: `Tk ${formatAmount(totalCatPayable)}` },
          { label: 'Paid Amount', value: `Tk ${formatAmount(totalCatPaid)}` },
          { label: 'Due Amount', value: `Tk ${formatAmount(totalCatDue)}` },
          { label: 'Category Profit', value: `Tk ${formatAmount(totalCatProfit)}` },
          { label: 'Net Profit', value: `Tk ${formatAmount(totalCatProfit)}` }
        ],
        columns: [
          { header: 'Category Name', key: 'category' },
          { header: 'Products', key: 'productsCount', align: 'center' },
          { header: 'Orders', key: 'orderCount', align: 'center' },
          { header: 'Units Sold', key: 'netUnitsSold', align: 'center' },
          { header: 'Total Sales', key: 'netSales', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Discount', key: 'discount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Total Payable', key: 'payable', align: 'right', format: (v, r) => `Tk ${formatAmount(v)} (Paid: ${formatAmount(r?.paidAmount || 0)})` },
          { header: 'Category Profit', key: 'categoryProfit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Net Profit', key: 'categoryProfit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` }
        ],
        data: filteredCategoryStats
      });
    } else if (reportType === 'BY_PRODUCT') {
      const totalUnitsSold = filteredProductStats.reduce((sum, p) => sum + p.netUnitsSold, 0);
      const totalProductSales = filteredProductStats.reduce((sum, p) => sum + p.netSales, 0);
      const totalProductDiscount = filteredProductStats.reduce((sum, p) => sum + p.discount, 0);
      const totalProductPayable = filteredProductStats.reduce((sum, p) => sum + p.payable, 0);
      const totalProductPaid = filteredProductStats.reduce((sum, p) => sum + p.paidAmount, 0);
      const totalProductDue = Math.max(0, totalProductPayable - totalProductPaid);
      const totalProductProfit = filteredProductStats.reduce((sum, p) => sum + p.productProfit, 0);

      exportTableToPdf({
        moduleName: 'Reports (By Product)',
        title: 'Product Sales Performance Report',
        dateRange: dateRangeLabel,
        summaryCards: [
          { label: 'Products Sold', value: String(filteredProductStats.length) },
          { label: 'Units Sold', value: `${totalUnitsSold} pcs` },
          { label: 'Total Sales', value: `Tk ${formatAmount(totalProductSales)}` },
          { label: 'Total Discount', value: `Tk ${formatAmount(totalProductDiscount)}` },
          { label: 'Total Payable', value: `Tk ${formatAmount(totalProductPayable)}` },
          { label: 'Paid Amount', value: `Tk ${formatAmount(totalProductPaid)}` },
          { label: 'Due Amount', value: `Tk ${formatAmount(totalProductDue)}` },
          { label: 'Product Profit', value: `Tk ${formatAmount(totalProductProfit)}` },
          { label: 'Net Profit', value: `Tk ${formatAmount(totalProductProfit)}` }
        ],
        columns: [
          { header: 'Product Name', key: 'productName' },
          { header: 'Brand', key: 'brand' },
          { header: 'Orders', key: 'orderCount', align: 'center' },
          { header: 'Units Sold', key: 'netUnitsSold', align: 'center' },
          { header: 'Total Sales', key: 'netSales', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Discount', key: 'discount', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Total Payable', key: 'payable', align: 'right', format: (v, r) => `Tk ${formatAmount(v)} (Paid: ${formatAmount(r?.paidAmount || 0)})` },
          { header: 'Product Profit', key: 'productProfit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Net Profit', key: 'productProfit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` }
        ],
        data: filteredProductStats
      });
    } else {
      const totalNetSalesAll = dateStatsList.reduce((sum, d) => sum + d.netSales, 0);
      const totalDiscountAll = dateStatsList.reduce((sum, d) => sum + d.discount, 0);
      const totalPayableAll = dateStatsList.reduce((sum, d) => sum + d.payable, 0);
      const totalPaidAll = dateStatsList.reduce((sum, d) => sum + d.paidAmount, 0);
      const totalDueAll = Math.max(0, totalPayableAll - totalPaidAll);
      const totalRefundAll = dateStatsList.reduce((sum, d) => sum + d.refundAmount, 0);
      const totalProfitAll = dateStatsList.reduce((sum, d) => sum + d.productProfit, 0);
      const totalExpensesAll = dateStatsList.reduce((sum, d) => sum + d.expenses, 0);
      const totalNetProfitAll = totalProfitAll - totalExpensesAll;

      exportTableToPdf({
        moduleName: 'Reports (By Date)',
        title: 'Business Performance Report (Date-wise Breakdown)',
        dateRange: dateRangeLabel,
        summaryCards: [
          { label: 'Total Sales', value: `Tk ${formatAmount(totalNetSalesAll)}` },
          { label: 'Total Discount', value: `Tk ${formatAmount(totalDiscountAll)}` },
          { label: 'Total Payable', value: `Tk ${formatAmount(totalPayableAll)}` },
          { label: 'Paid Amount', value: `Tk ${formatAmount(totalPaidAll)}` },
          { label: 'Due Amount', value: `Tk ${formatAmount(totalDueAll)}` },
          { label: 'Cash Refunded', value: `Tk ${formatAmount(totalRefundAll)}` },
          { label: 'Product Profit', value: `Tk ${formatAmount(totalProfitAll)}` },
          { label: 'Expenses', value: `Tk ${formatAmount(totalExpensesAll)}` },
          { label: 'Net Profit', value: `Tk ${formatAmount(totalNetProfitAll)}` },
          { label: 'Total Orders', value: String(filteredSales.length) }
        ],
        columns: [
          { header: 'Date', key: 'dateKey', format: (v) => formatDateDisplay(v) },
          { header: 'Orders', key: 'orderCount', align: 'center' },
          { header: 'Units (Sold/Ret)', key: 'unitsSold', align: 'center', format: (v, r) => `${v} / ${r?.unitsReturned || 0}` },
          { header: 'Total Sales', key: 'netSales', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Discount', key: 'discount', align: 'right', format: (v) => v > 0 ? `Tk ${formatAmount(v)}` : '-' },
          { header: 'Total Payable', key: 'payable', align: 'right', format: (v, r) => `Tk ${formatAmount(v)} (Paid: ${formatAmount(r?.paidAmount || 0)})` },
          { header: 'Cash Refund', key: 'refundAmount', align: 'right', format: (v) => v > 0 ? `-Tk ${formatAmount(v)}` : '-' },
          { header: 'Product Profit', key: 'productProfit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Expenses', key: 'expenses', align: 'right', format: (v) => `Tk ${formatAmount(v)}` },
          { header: 'Net Profit', key: 'netProfit', align: 'right', format: (v) => `Tk ${formatAmount(v)}` }
        ],
        data: dateStatsList
      });
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading business analytics...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Date Range Selector Bar */}
      <div className="reports-filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Business Performance Reports</h3>
          {isAdminRole(userRole) && (
            <button
              onClick={handleDownloadPdf}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0 10px', height: '28px', fontSize: '11.5px', gap: '5px', fontWeight: 700 }}
              title={`Download ${reportType === 'BY_INVOICE' ? 'Invoice-wise' : reportType === 'BY_CATEGORY' ? 'Category' : reportType === 'BY_PRODUCT' ? 'Product' : 'Date-wise'} PDF Report`}
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
                onClick={() => {
                  setFilter(option);
                  setCurrentPage(1);
                }}
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
                  {option === 'all'
                    ? 'All Time'
                    : option === 'week'
                      ? 'This Week'
                      : option === 'month'
                        ? 'This Month'
                        : option === 'month_select'
                          ? 'Select Month'
                          : option === 'custom'
                            ? 'Custom Range'
                            : 'Today'}
                </span>
              </button>
            ))}
          </div>

          {filter === 'month_select' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 10px',
              height: '34px',
              boxShadow: 'var(--shadow-xs)',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Select Month:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11.5px',
                    outline: 'none',
                    fontWeight: 600,
                    color: '#1e293b',
                    height: '24px',
                    flex: 1,
                    cursor: 'pointer'
                  }}
                />
              </div>
            </div>
          )}

          {filter === 'custom' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 10px',
              height: '34px',
              boxShadow: 'var(--shadow-xs)',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11.5px',
                    outline: 'none',
                    fontWeight: 600,
                    color: '#1e293b',
                    height: '24px',
                    width: '100%',
                    cursor: 'pointer'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11.5px',
                    outline: 'none',
                    fontWeight: 600,
                    color: '#1e293b',
                    height: '24px',
                    width: '100%',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setCurrentPage(1);
                  }}
                  style={{
                    fontSize: '10.5px',
                    padding: '0 8px',
                    height: '24px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}
                  title="Reset date inputs"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="reports-kpi-grid">
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Total Sales</div>
          <div className="card-value" style={{ color: 'var(--text-primary)' }}>
            ৳{formatAmount(totalNetSales)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {totalSoldUnits - totalReturnedUnits} net units sold
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Total Discount</div>
          <div className="card-value" style={{ color: totalDiscount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
            ৳{formatAmount(totalDiscount)}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Total Payable</div>
          <div className="card-value" style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
            ৳{formatAmount(totalPayable)}
          </div>
          <div style={{ fontSize: '10.5px', marginTop: '3px', fontWeight: 600 }}>
            <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(totalPaid)}</span>
            {totalDueCollectedAll > 0 && (
              <span style={{ color: '#0284c7', marginLeft: '4px' }} title="Due collected during selected date period">
                (incl. ৳{formatAmount(totalDueCollectedAll)} due)
              </span>
            )}
            {totalDue > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '6px' }}>· Due: ৳{formatAmount(totalDue)}</span>}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Cash Refunded</div>
          <div className="card-value" style={{ color: totalActualCashRefunded > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
            {totalActualCashRefunded > 0 ? `-৳${formatAmount(totalActualCashRefunded)}` : '৳0'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {totalActualCashRefunded > 0 ? 'Cash paid back' : 'No cash payout'}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Product Profit</div>
          <div className="card-value" style={{ color: 'var(--color-info)' }}>
            ৳{formatAmount(totalProfit)}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Shop Expenses</div>
          <div className="card-value" style={{ color: 'var(--color-danger)' }}>
            ৳{formatAmount(totalExpenses)}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Stock Valuation</div>
          <div className="card-value" style={{ color: 'var(--text-primary)' }}>
            ৳{formatAmount(totalStockValuation)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {totalStockUnits} units in stock
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Net Profit</div>
          <div className="card-value" style={{ color: overallNetProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            ৳{formatAmount(overallNetProfit)}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="card-title">Total Orders</div>
          <div className="card-value">{filteredSales.length}</div>
        </div>
      </div>

      {/* Report Switcher Bar (By Date vs By Product vs By Category) */}
      <div className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setReportType('BY_DATE'); setCurrentPage(1); }}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: reportType === 'BY_DATE' ? 'var(--color-primary)' : 'transparent',
              color: reportType === 'BY_DATE' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            By Date
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setReportType('BY_PRODUCT'); setCurrentPage(1); }}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: reportType === 'BY_PRODUCT' ? 'var(--color-primary)' : 'transparent',
              color: reportType === 'BY_PRODUCT' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            By Product
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setReportType('BY_CATEGORY'); setCurrentPage(1); }}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: reportType === 'BY_CATEGORY' ? 'var(--color-primary)' : 'transparent',
              color: reportType === 'BY_CATEGORY' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            By Category
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setReportType('BY_INVOICE'); setCurrentPage(1); }}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              background: reportType === 'BY_INVOICE' ? 'var(--color-primary)' : 'transparent',
              color: reportType === 'BY_INVOICE' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            By Invoice
          </button>
        </div>

        {reportType === 'BY_INVOICE' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 360px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', minWidth: '180px', flex: '1 1 180px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Search invoice #, customer, method..."
                value={invoiceSearchQuery}
                onChange={(e) => {
                  setInvoiceSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12px', width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Method:</span>
              <select
                className="form-control"
                value={invoicePaymentFilter}
                onChange={(e) => {
                  setInvoicePaymentFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ height: '34px', fontSize: '11.5px', fontWeight: 600, width: 'auto', paddingRight: '20px' }}
              >
                <option value="ALL">All Methods</option>
                <option value="CASH">Cash</option>
                <option value="BKASH">bKash</option>
                <option value="CARD">Card</option>
                <option value="NAGAD">Nagad</option>
                <option value="DUE">Due</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Sort:</span>
              <select
                className="form-control"
                value={invoiceSortBy}
                onChange={(e) => setInvoiceSortBy(e.target.value as InvoiceSortKey)}
                style={{ height: '34px', fontSize: '11.5px', fontWeight: 600, width: 'auto', paddingRight: '24px' }}
              >
                <option value="date_desc">Latest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="sales_desc">Highest Sales</option>
                <option value="profit_desc">Highest Profit</option>
                <option value="due_desc">Highest Due</option>
              </select>
            </div>
          </div>
        )}

        {reportType === 'BY_PRODUCT' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 320px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Search product or brand..."
                value={productSearchQuery}
                onChange={(e) => {
                  setProductSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12px', width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Sort:</span>
              <select
                className="form-control"
                value={productSortBy}
                onChange={(e) => setProductSortBy(e.target.value as ProductSortKey)}
                style={{ height: '34px', fontSize: '11.5px', fontWeight: 600, width: 'auto', paddingRight: '24px' }}
              >
                <option value="sales">Highest Sales</option>
                <option value="profit">Highest Profit</option>
                <option value="units">Most Units Sold</option>
                <option value="stock">Lowest Stock</option>
                <option value="name">Product Name (A-Z)</option>
              </select>
            </div>
          </div>
        )}

        {reportType === 'BY_CATEGORY' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 320px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Search category..."
                value={categorySearchQuery}
                onChange={(e) => {
                  setCategorySearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12px', width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Sort:</span>
              <select
                className="form-control"
                value={categorySortBy}
                onChange={(e) => setCategorySortBy(e.target.value as CategorySortKey)}
                style={{ height: '34px', fontSize: '11.5px', fontWeight: 600, width: 'auto', paddingRight: '24px' }}
              >
                <option value="sales">Highest Sales</option>
                <option value="profit">Highest Profit</option>
                <option value="units">Most Units Sold</option>
                <option value="products">Most Products</option>
                <option value="stock">Lowest Stock</option>
                <option value="name">Category Name (A-Z)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 1. BY DATE PERFORMANCE BREAKDOWN TABLE */}
      {/* ---------------------------------------------------------------- */}
      {reportType === 'BY_DATE' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Date-wise Performance Breakdown</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {dateStatsList.length} date entries
            </span>
          </div>

          {dateStatsList.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
              No sales or expense activity recorded for this time range.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="table-container reports-desktop-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'center' }}>Orders</th>
                      <th style={{ textAlign: 'center' }}>Sold / Ret</th>
                      <th style={{ textAlign: 'right' }}>Total Sales</th>
                      <th style={{ textAlign: 'right' }}>Discount</th>
                      <th style={{ textAlign: 'right' }}>Total Payable</th>
                      <th style={{ textAlign: 'right' }}>Cash Refund</th>
                      <th style={{ textAlign: 'right' }}>Product Profit</th>
                      <th style={{ textAlign: 'right' }}>Expenses</th>
                      <th style={{ textAlign: 'right' }}>Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateStatsList
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((item, idx) => (
                        <tr key={item.dateKey}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                            {formatDateDisplay(item.dateKey)}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.orderCount}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11.5px' }}>
                            <span style={{ color: 'var(--color-primary)' }}>{item.unitsSold} sold</span>
                            {item.unitsReturned > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· {item.unitsReturned} ret</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>৳{formatAmount(item.netSales)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: item.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {item.discount > 0 ? `৳${formatAmount(item.discount)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            <div style={{ color: 'var(--color-primary)' }}>৳{formatAmount(item.payable)}</div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(item.paidAmount)}</span>
                              {item.dueCollected > 0 && (
                                <span style={{ color: '#0284c7', marginLeft: '4px' }} title="Due collected on this date">
                                  (incl. ৳{formatAmount(item.dueCollected)} due)
                                </span>
                              )}
                              {item.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(item.dueAmount)}</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: item.refundAmount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {item.refundAmount > 0 ? `-৳${formatAmount(item.refundAmount)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-info)' }}>৳{formatAmount(item.productProfit)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: item.expenses > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            ৳{formatAmount(item.expenses)}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            color: item.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                          }}>
                            ৳{formatAmount(item.netProfit)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="reports-mobile-cards">
                {dateStatsList
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((item, idx) => (
                    <div
                      key={item.dateKey}
                      className="card"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>#{(currentPage - 1) * pageSize + idx + 1}</span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {formatDateDisplay(item.dateKey)}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          padding: '2px 7px',
                          borderRadius: '4px'
                        }}>
                          {item.orderCount} orders · {item.unitsSold} sold {item.unitsReturned > 0 ? `(${item.unitsReturned} ret)` : ''}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11.5px' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Sales</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-primary)' }}>৳{formatAmount(item.netSales)}</div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Discount</div>
                          <div style={{ fontWeight: 700, color: item.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {item.discount > 0 ? `৳${formatAmount(item.discount)}` : '-'}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Payable</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-primary)' }}>৳{formatAmount(item.payable)}</div>
                          <div style={{ fontSize: '9.5px', fontWeight: 600, marginTop: '2px' }}>
                            <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(item.paidAmount)}</span>
                            {item.dueCollected > 0 && (
                              <span style={{ color: '#0284c7', marginLeft: '3px' }}>
                                (incl. ৳{formatAmount(item.dueCollected)} due)
                              </span>
                            )}
                            {item.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(item.dueAmount)}</span>}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Cash Refund</div>
                          <div style={{ fontWeight: 700, color: item.refundAmount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {item.refundAmount > 0 ? `-৳${formatAmount(item.refundAmount)}` : '৳0'}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Product Profit</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-info)' }}>৳{formatAmount(item.productProfit)}</div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Expenses</div>
                          <div style={{ fontWeight: 700, color: item.expenses > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            ৳{formatAmount(item.expenses)}
                          </div>
                        </div>

                        <div style={{
                          background: item.netProfit >= 0 ? '#ecfdf5' : '#fef2f2',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: item.netProfit >= 0 ? '1px solid #d1fae5' : '1px solid #fee2e2',
                          gridColumn: 'span 2'
                        }}>
                          <div style={{ fontSize: '10px', color: item.netProfit >= 0 ? '#065f46' : '#991b1b', fontWeight: 600 }}>Net Profit</div>
                          <div style={{ fontWeight: 800, color: item.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            ৳{formatAmount(item.netProfit)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalItems={dateStatsList.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 2. BY PRODUCT PERFORMANCE BREAKDOWN TABLE */}
      {/* ---------------------------------------------------------------- */}
      {reportType === 'BY_PRODUCT' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Product Sales & Profitability Breakdown</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {filteredProductStats.length} products
            </span>
          </div>

          {filteredProductStats.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
              No products found matching your search or time range.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="table-container reports-desktop-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                      <th>Product Name</th>
                      <th>Brand</th>
                      <th style={{ textAlign: 'center' }}>Orders</th>
                      <th style={{ textAlign: 'center' }}>Units Sold</th>
                      <th style={{ textAlign: 'right' }}>Total Sales</th>
                      <th style={{ textAlign: 'right' }}>Discount</th>
                      <th style={{ textAlign: 'right' }}>Total Payable</th>
                      <th style={{ textAlign: 'right' }}>Product Profit</th>
                      <th style={{ textAlign: 'right' }}>Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductStats
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((prod, idx) => (
                        <tr key={prod.productId}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                            {prod.productName}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {prod.brand && prod.brand !== '-' ? prod.brand : '-'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            {prod.orderCount}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: prod.netUnitsSold > 0 ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                            {prod.netUnitsSold} pcs
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            ৳{formatAmount(prod.netSales)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: prod.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {prod.discount > 0 ? `৳${formatAmount(prod.discount)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            <div style={{ color: 'var(--color-primary)' }}>৳{formatAmount(prod.payable)}</div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(prod.paidAmount)}</span>
                              {prod.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(prod.dueAmount)}</span>}
                            </div>
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: 'var(--color-info)'
                          }}>
                            ৳{formatAmount(prod.productProfit)}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            color: prod.productProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                          }}>
                            ৳{formatAmount(prod.productProfit)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View for Products */}
              <div className="reports-mobile-cards">
                {filteredProductStats
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((prod, idx) => (
                    <div
                      key={prod.productId}
                      className="card"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginRight: '6px' }}>
                            #{(currentPage - 1) * pageSize + idx + 1}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {prod.productName}
                          </span>
                          {prod.brand && prod.brand !== '-' && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 600 }}>
                              Brand: {prod.brand}
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          padding: '2px 7px',
                          borderRadius: '4px'
                        }}>
                          {prod.orderCount} orders · {prod.netUnitsSold} pcs
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11.5px' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Sales</div>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>৳{formatAmount(prod.netSales)}</div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Discount</div>
                          <div style={{ fontWeight: 700, color: prod.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {prod.discount > 0 ? `৳${formatAmount(prod.discount)}` : '-'}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Payable</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-primary)' }}>৳{formatAmount(prod.payable)}</div>
                          <div style={{ fontSize: '9.5px', fontWeight: 600, marginTop: '2px' }}>
                            <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(prod.paidAmount)}</span>
                            {prod.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(prod.dueAmount)}</span>}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Product Profit</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-info)' }}>৳{formatAmount(prod.productProfit)}</div>
                        </div>

                        <div style={{
                          background: prod.productProfit >= 0 ? '#ecfdf5' : '#fef2f2',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: prod.productProfit >= 0 ? '1px solid #d1fae5' : '1px solid #fee2e2',
                          gridColumn: 'span 2'
                        }}>
                          <div style={{ fontSize: '10px', color: prod.productProfit >= 0 ? '#065f46' : '#991b1b', fontWeight: 600 }}>Net Profit</div>
                          <div style={{ fontWeight: 800, color: prod.productProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            ৳{formatAmount(prod.productProfit)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalItems={filteredProductStats.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. BY CATEGORY PERFORMANCE BREAKDOWN TABLE */}
      {/* ---------------------------------------------------------------- */}
      {reportType === 'BY_CATEGORY' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Category Sales & Profitability Breakdown</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {filteredCategoryStats.length} categories
            </span>
          </div>

          {filteredCategoryStats.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
              No categories found matching your search or time range.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="table-container reports-desktop-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                      <th>Category Name</th>
                      <th style={{ textAlign: 'center' }}>Products</th>
                      <th style={{ textAlign: 'center' }}>Stock</th>
                      <th style={{ textAlign: 'center' }}>Orders</th>
                      <th style={{ textAlign: 'center' }}>Units Sold</th>
                      <th style={{ textAlign: 'right' }}>Total Sales</th>
                      <th style={{ textAlign: 'right' }}>Discount</th>
                      <th style={{ textAlign: 'right' }}>Total Payable</th>
                      <th style={{ textAlign: 'right' }}>Category Profit</th>
                      <th style={{ textAlign: 'right' }}>Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategoryStats
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((cat, idx) => (
                        <tr key={cat.category}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                            {cat.category}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            <span style={{
                              background: '#f1f5f9',
                              color: '#475569',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>
                              {cat.productsCount} products
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {cat.currentStock} pcs
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            {cat.orderCount}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: cat.netUnitsSold > 0 ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                            {cat.netUnitsSold} pcs
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            ৳{formatAmount(cat.netSales)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: cat.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {cat.discount > 0 ? `৳${formatAmount(cat.discount)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            <div style={{ color: 'var(--color-primary)' }}>৳{formatAmount(cat.payable)}</div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(cat.paidAmount)}</span>
                              {cat.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(cat.dueAmount)}</span>}
                            </div>
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: 'var(--color-info)'
                          }}>
                            ৳{formatAmount(cat.categoryProfit)}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            color: cat.categoryProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                          }}>
                            ৳{formatAmount(cat.categoryProfit)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View for Categories */}
              <div className="reports-mobile-cards">
                {filteredCategoryStats
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((cat, idx) => (
                    <div
                      key={cat.category}
                      className="card"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginRight: '6px' }}>
                            #{(currentPage - 1) * pageSize + idx + 1}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {cat.category}
                          </span>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 600 }}>
                            {cat.productsCount} products · {cat.currentStock} in stock
                          </div>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          padding: '2px 7px',
                          borderRadius: '4px'
                        }}>
                          {cat.orderCount} orders · {cat.netUnitsSold} pcs
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11.5px' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Sales</div>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>৳{formatAmount(cat.netSales)}</div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Discount</div>
                          <div style={{ fontWeight: 700, color: cat.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {cat.discount > 0 ? `৳${formatAmount(cat.discount)}` : '-'}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Payable</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-primary)' }}>৳{formatAmount(cat.payable)}</div>
                          <div style={{ fontSize: '9.5px', fontWeight: 600, marginTop: '2px' }}>
                            <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(cat.paidAmount)}</span>
                            {cat.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(cat.dueAmount)}</span>}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Category Profit</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-info)' }}>৳{formatAmount(cat.categoryProfit)}</div>
                        </div>

                        <div style={{
                          background: cat.categoryProfit >= 0 ? '#ecfdf5' : '#fef2f2',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: cat.categoryProfit >= 0 ? '1px solid #d1fae5' : '1px solid #fee2e2',
                          gridColumn: 'span 2'
                        }}>
                          <div style={{ fontSize: '10px', color: cat.categoryProfit >= 0 ? '#065f46' : '#991b1b', fontWeight: 600 }}>Net Profit</div>
                          <div style={{ fontWeight: 800, color: cat.categoryProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            ৳{formatAmount(cat.categoryProfit)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalItems={filteredCategoryStats.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. BY INVOICE PERFORMANCE BREAKDOWN TABLE */}
      {/* ---------------------------------------------------------------- */}
      {reportType === 'BY_INVOICE' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Invoice-wise Sales & Profitability Breakdown</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {filteredInvoiceStats.length} invoices
            </span>
          </div>

          {filteredInvoiceStats.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
              No invoices found matching your filter or search criteria.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="table-container reports-desktop-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                      <th>Invoice #</th>
                      <th>Date & Time</th>
                      <th>Customer</th>
                      <th style={{ textAlign: 'center' }}>Method</th>
                      <th style={{ textAlign: 'center' }}>Units</th>
                      <th style={{ textAlign: 'right' }}>Total Sales</th>
                      <th style={{ textAlign: 'right' }}>Discount</th>
                      <th style={{ textAlign: 'right' }}>Total Payable</th>
                      <th style={{ textAlign: 'right' }}>Cost of Goods (COGS)</th>
                      <th style={{ textAlign: 'right' }}>Profit</th>
                      <th style={{ textAlign: 'center', width: '60px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoiceStats
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((inv, idx) => (
                        <tr key={inv.saleId}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td style={{ fontWeight: 800, fontSize: '12px', color: 'var(--color-primary)' }}>
                            <span style={{
                              background: 'var(--color-primary-light)',
                              color: 'var(--color-primary)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              border: '1px solid #bfdbfe',
                              letterSpacing: '0.5px'
                            }}>
                              #{inv.invoiceCode}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700 }}>{formatDateDDMMYYYY(inv.saleDate)}</div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{formatTimeAMPM(inv.saleDate)}</div>
                          </td>
                          <td style={{ fontSize: '12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {inv.customerName || 'Walk-in'}
                            </div>
                            {inv.customerPhone && (
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {inv.customerPhone}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: inv.paymentMethod === 'CASH' ? '#ecfdf5' : inv.paymentMethod === 'DUE' ? '#fef2f2' : '#f0f9ff',
                              color: inv.paymentMethod === 'CASH' ? '#047857' : inv.paymentMethod === 'DUE' ? '#b91c1c' : '#0369a1',
                              border: inv.paymentMethod === 'CASH' ? '1px solid #a7f3d0' : inv.paymentMethod === 'DUE' ? '1px solid #fecaca' : '1px solid #bae6fd'
                            }}>
                              {inv.paymentMethod}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '11.5px' }}>
                            <span style={{ color: 'var(--color-primary)' }}>{inv.unitsSold} sold</span>
                            {inv.unitsReturned > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '3px' }}>· {inv.unitsReturned} ret</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            ৳{formatAmount(inv.grossSales)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: inv.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {inv.discount > 0 ? `৳${formatAmount(inv.discount)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            <div style={{ color: 'var(--color-primary)' }}>৳{formatAmount(inv.payable)}</div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(inv.paidAmount)}</span>
                              {inv.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(inv.dueAmount)}</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            ৳{formatAmount(inv.totalCogs)}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            color: inv.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                          }}>
                            ৳{formatAmount(inv.profit)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenInvoiceModal(inv.rawSale)}
                              style={{ padding: '4px 8px', height: '26px' }}
                              title="View / Print Invoice Receipt"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View for Invoices */}
              <div className="reports-mobile-cards">
                {filteredInvoiceStats
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((inv, idx) => (
                    <div
                      key={inv.saleId}
                      className="card"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>
                              #{(currentPage - 1) * pageSize + idx + 1}
                            </span>
                            <span style={{
                              background: 'var(--color-primary-light)',
                              color: 'var(--color-primary)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              border: '1px solid #bfdbfe'
                            }}>
                              #{inv.invoiceCode}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {formatDateDDMMYYYY(inv.saleDate)} {formatTimeAMPM(inv.saleDate)}
                            </span>
                          </div>
                          <div style={{ marginTop: '3px', fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                            {inv.customerName || 'Walk-in'}
                            {inv.customerPhone && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>({inv.customerPhone})</span>}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: inv.paymentMethod === 'CASH' ? '#ecfdf5' : inv.paymentMethod === 'DUE' ? '#fef2f2' : '#f0f9ff',
                          color: inv.paymentMethod === 'CASH' ? '#047857' : inv.paymentMethod === 'DUE' ? '#b91c1c' : '#0369a1'
                        }}>
                          {inv.paymentMethod}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11.5px' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Sales</div>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>৳{formatAmount(inv.grossSales)}</div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Discount</div>
                          <div style={{ fontWeight: 700, color: inv.discount > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                            {inv.discount > 0 ? `৳${formatAmount(inv.discount)}` : '-'}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Payable</div>
                          <div style={{ fontWeight: 800, color: 'var(--color-primary)' }}>৳{formatAmount(inv.payable)}</div>
                          <div style={{ fontSize: '9.5px', fontWeight: 600, marginTop: '2px' }}>
                            <span style={{ color: 'var(--color-success)' }}>Paid: ৳{formatAmount(inv.paidAmount)}</span>
                            {inv.dueAmount > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>· Due: ৳{formatAmount(inv.dueAmount)}</span>}
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Cost of Goods (COGS)</div>
                          <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>৳{formatAmount(inv.totalCogs)}</div>
                        </div>

                        <div style={{
                          background: inv.profit >= 0 ? '#ecfdf5' : '#fef2f2',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: inv.profit >= 0 ? '1px solid #d1fae5' : '1px solid #fee2e2',
                          gridColumn: 'span 2',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: '10px', color: inv.profit >= 0 ? '#065f46' : '#991b1b', fontWeight: 600 }}>Invoice Profit</div>
                            <div style={{ fontWeight: 800, color: inv.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              ৳{formatAmount(inv.profit)}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenInvoiceModal(inv.rawSale)}
                            style={{ padding: '3px 8px', fontSize: '11px', height: '26px', gap: '4px' }}
                          >
                            <Eye size={12} />
                            <span>View Receipt</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalItems={filteredInvoiceStats.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* Invoice Details / Print Modal */}
      {selectedSaleForModal && !modalItemsLoading && invoiceModalData && (
        <InvoicePrintModal
          data={invoiceModalData}
          onClose={() => {
            setSelectedSaleForModal(null);
            setModalSaleItems([]);
          }}
        />
      )}

    </div>
  );
};
