import { supabase } from './supabaseClient';
import type { Product, ProductVariant } from './store';

// High-speed In-Memory Cache with TTL
interface CacheStore {
  products?: { data: Product[]; timestamp: number };
  variants?: { data: ProductVariant[]; timestamp: number };
  suppliers?: { data: any[]; timestamp: number };
  purchases?: { data: any[]; timestamp: number };
  sales?: { data: any[]; timestamp: number };
  expenses?: { data: any[]; timestamp: number };
  users?: { data: any[]; timestamp: number };
  stock_ledger?: { data: any[]; timestamp: number };
  sale_items_detailed?: { data: any[]; timestamp: number };
  payment_collections?: { data: any[]; timestamp: number };
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute fresh cache
const cache: CacheStore = {};

export const clearPosCache = (keys?: (keyof CacheStore)[]) => {
  if (!keys) {
    Object.keys(cache).forEach((k) => delete cache[k as keyof CacheStore]);
  } else {
    keys.forEach((k) => delete cache[k]);
  }
};

export const dbService = {
  // Cache utility
  clearCache: clearPosCache,

  // --- Products & Variants ---
  async getProducts(forceRefresh = false): Promise<Product[]> {
    const now = Date.now();
    if (!forceRefresh && cache.products && (now - cache.products.timestamp < CACHE_TTL_MS)) {
      return cache.products.data;
    }
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const result = data || [];
    cache.products = { data: result, timestamp: now };
    return result;
  },

  async saveProduct(product: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .upsert(product)
      .select()
      .single();
    if (error) throw error;
    clearPosCache(['products', 'variants']);
    return data;
  },

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    if (error) throw error;
    clearPosCache(['products', 'variants']);
  },

  async clearAllProducts(): Promise<void> {
    const { data: prods } = await supabase.from('products').select('id');
    if (prods && prods.length > 0) {
      const ids = prods.map(p => p.id);
      await supabase.from('product_variants').delete().in('product_id', ids);
      const { error } = await supabase.from('products').delete().in('id', ids);
      if (error) throw error;
    }
    clearPosCache(['products', 'variants', 'stock_ledger']);
  },

  async getVariants(forceRefresh = false): Promise<ProductVariant[]> {
    const now = Date.now();
    if (!forceRefresh && cache.variants && (now - cache.variants.timestamp < CACHE_TTL_MS)) {
      return cache.variants.data;
    }
    const { data, error } = await supabase
      .from('product_variants')
      .select('*, product:products(*)')
      .limit(50000);
    if (error) throw error;
    const result = (data || []).map(v => ({
      ...v,
      barcode: (v.barcode || '').trim().replace(/[^0-9a-zA-Z]/g, '')
    }));
    cache.variants = { data: result, timestamp: now };
    return result;
  },

  async saveVariant(variant: Omit<ProductVariant, 'id'> & { id?: string }): Promise<ProductVariant> {
    const payload = { ...variant };
    if (payload.barcode) {
      payload.barcode = payload.barcode.trim().replace(/[^0-9a-zA-Z]/g, '');
    } else if (!payload.id) {
      const existing = await this.getVariants(true);
      const usedBarcodes = new Set<string>();
      let maxNum = 0;
      for (const v of existing) {
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
      let candidate = Math.max(1, maxNum + 1);
      while (usedBarcodes.has(String(candidate).padStart(6, '0')) || usedBarcodes.has(String(candidate))) {
        candidate++;
      }
      payload.barcode = String(candidate).padStart(6, '0');
    }

    const { data, error } = await supabase
      .from('product_variants')
      .upsert(payload)
      .select()
      .single();
    if (error) {
      const errMsg = error.message || '';
      if (error.code === '23505' || errMsg.includes('duplicate key') || errMsg.includes('unique constraint') || errMsg.includes('unique contsraint')) {
        if (errMsg.includes('barcode')) {
          throw new Error(`Barcode "${payload.barcode}" already exists in the inventory. Please generate or enter a different barcode.`);
        }
        if (errMsg.includes('sku')) {
          throw new Error(`SKU "${payload.sku}" already exists in the inventory. Please change the bundle or serial number.`);
        }
      }
      throw error;
    }

    if (!variant.id && data && data.stock_quantity > 0) {
      try {
        await supabase.from('stock_ledger').insert({
          variant_id: data.id,
          transaction_type: 'INITIAL_STOCK',
          quantity_change: data.stock_quantity,
          notes: 'Initial stock entered during variant creation'
        });
      } catch (ledgerErr) {
        console.warn('Failed to record initial stock ledger', ledgerErr);
      }
    }

    clearPosCache(['variants', 'stock_ledger']);
    return data;
  },

  async deleteVariant(id: string): Promise<void> {
    const { error } = await supabase
      .from('product_variants')
      .delete()
      .eq('id', id);
    if (error) throw error;
    clearPosCache(['variants']);
  },

  // --- Suppliers ---
  async getSuppliers(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.suppliers && (now - cache.suppliers.timestamp < CACHE_TTL_MS)) {
      return cache.suppliers.data;
    }
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    const result = data || [];
    cache.suppliers = { data: result, timestamp: now };
    return result;
  },

  async saveSupplier(supplier: any) {
    const { data, error } = await supabase
      .from('suppliers')
      .upsert(supplier)
      .select()
      .single();
    if (error) throw error;
    clearPosCache(['suppliers', 'purchases']);
    return data;
  },

  // --- Purchases ---
  async getPurchases(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.purchases && (now - cache.purchases.timestamp < CACHE_TTL_MS)) {
      return cache.purchases.data;
    }
    const { data, error } = await supabase
      .from('purchases')
      .select('*, supplier:suppliers(*)')
      .order('purchase_date', { ascending: false });
    if (error) throw error;
    const result = data || [];
    cache.purchases = { data: result, timestamp: now };
    return result;
  },

  async addPurchase(supplierId: string, items: { variantId: string; quantity: number; unitCost: number }[], invoiceNumber: string, shippingCost: number = 0) {
    const totalAmount = items.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0) + (Number(shippingCost) || 0);

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        supplier_id: supplierId,
        total_amount: totalAmount,
        invoice_number: invoiceNumber,
        status: 'RECEIVED'
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    if (purchase) {
      const purchaseItems = items.map(item => ({
        purchase_id: purchase.id,
        variant_id: item.variantId,
        quantity: item.quantity,
        unit_cost: item.unitCost
      }));
      const { error: itemsError } = await supabase
        .from('purchase_items')
        .insert(purchaseItems);
      
      if (itemsError) throw itemsError;
    }
    clearPosCache(['purchases', 'variants', 'stock_ledger']);
  },

  async adjustStock(variantId: string, newStockQuantity: number, reason: string = 'Manual stock adjustment') {
    // 1. Get existing variant stock
    const { data: variant, error: getErr } = await supabase
      .from('product_variants')
      .select('stock_quantity')
      .eq('id', variantId)
      .single();
    if (getErr) throw getErr;

    const currentStock = variant?.stock_quantity ?? 0;
    const delta = newStockQuantity - currentStock;

    // 2. Update variant stock
    const { data: updatedVariant, error: updateErr } = await supabase
      .from('product_variants')
      .update({ stock_quantity: newStockQuantity })
      .eq('id', variantId)
      .select('*, product:products(*)')
      .single();
    if (updateErr) throw updateErr;

    // 3. Record transaction in stock ledger
    const { error: ledgerErr } = await supabase
      .from('stock_ledger')
      .insert({
        variant_id: variantId,
        transaction_type: 'ADJUSTMENT',
        quantity_change: delta,
        notes: reason || `Manual adjustment from ${currentStock} to ${newStockQuantity}`
      });
    if (ledgerErr) {
      console.warn('Could not record stock ledger for adjustment:', ledgerErr);
    }

    clearPosCache(['variants', 'stock_ledger']);
    return updatedVariant;
  },

  // --- Sales ---
  async getSales(forceRefresh = false, limit?: number) {
    const now = Date.now();
    if (!forceRefresh && cache.sales && (now - cache.sales.timestamp < CACHE_TTL_MS)) {
      return limit ? cache.sales.data.slice(0, limit) : cache.sales.data;
    }
    let query = supabase
      .from('sales')
      .select('*, sale_items(id, variant_id, quantity, unit_price, total_price, sale_type, return_date, is_returned, variant:product_variants(id, barcode, sku, size, color, product:products(name)))')
      .order('sale_date', { ascending: false });

    if (limit) {
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    const { data, error } = await query;
    if (error) throw error;
    const result = data || [];
    cache.sales = { data: result, timestamp: now };
    return result;
  },

  async getSaleItems(saleId: string) {
    const { data, error } = await supabase
      .from('sale_items')
      .select('*, variant:product_variants(*, product:products(*))')
      .eq('sale_id', saleId);
    if (error) throw error;
    return data || [];
  },

  // Helper: Determine next 6-digit sequential invoice code (e.g., 000001, 000002)
  async getNextInvoiceCode(): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('invoice_code')
        .not('invoice_code', 'is', null)
        .order('sale_date', { ascending: false })
        .limit(100);

      let maxNum = 0;
      if (!error && data && data.length > 0) {
        for (const row of data) {
          if (row.invoice_code) {
            const cleanStr = String(row.invoice_code).trim();
            if (/^\d+$/.test(cleanStr)) {
              const num = parseInt(cleanStr, 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
        }
      }

      if (maxNum === 0) {
        const { count } = await supabase
          .from('sales')
          .select('*', { count: 'exact', head: true });
        maxNum = count || 0;
      }

      const nextNum = maxNum + 1;
      return String(nextNum).padStart(6, '0');
    } catch (err) {
      console.error('Error fetching next invoice code:', err);
      try {
        const { count } = await supabase
          .from('sales')
          .select('*', { count: 'exact', head: true });
        return String((count || 0) + 1).padStart(6, '0');
      } catch {
        return '000001';
      }
    }
  },

  // Safe one-time / maintenance utility to backfill serial invoice_codes on all past sales without touching any other fields
  async syncAllInvoiceCodes(): Promise<{ success: boolean; updatedCount: number }> {
    try {
      const { data: allSales, error } = await supabase
        .from('sales')
        .select('id, sale_date, invoice_code')
        .order('sale_date', { ascending: true });

      if (error) throw error;
      if (!allSales || allSales.length === 0) return { success: true, updatedCount: 0 };

      let updatedCount = 0;
      for (let i = 0; i < allSales.length; i++) {
        const sale = allSales[i];
        const targetCode = String(i + 1).padStart(6, '0');
        if (sale.invoice_code !== targetCode) {
          const { error: updateError } = await supabase
            .from('sales')
            .update({ invoice_code: targetCode })
            .eq('id', sale.id);

          if (!updateError) {
            updatedCount++;
          }
        }
      }

      clearPosCache(['sales']);
      return { success: true, updatedCount };
    } catch (err) {
      console.error('Failed to sync invoice codes:', err);
      throw err;
    }
  },

  async checkoutSale(
    cart: {
      variant: ProductVariant;
      quantity: number;
      customPrice?: number;
      saleType?: 'SALE' | 'RETURN';
    }[],
    discount: number,
    paymentMethod: string,
    receivedAmount: number,
    customerPhone: string = '',
    customerName: string = '',
    guarantorName: string = '',
    guarantorPhone: string = ''
  ) {
    const salesSubtotal = cart
      .filter(item => item.saleType !== 'RETURN')
      .reduce((acc, item) => acc + (item.quantity * (item.customPrice !== undefined ? item.customPrice : item.variant.selling_price)), 0);

    const returnsTotal = cart
      .filter(item => item.saleType === 'RETURN')
      .reduce((acc, item) => acc + (item.quantity * (item.customPrice !== undefined ? item.customPrice : item.variant.selling_price)), 0);

    const netSubtotal = salesSubtotal - returnsTotal;
    const payableAmount = netSubtotal - discount;
    const changeAmount = payableAmount > 0 && receivedAmount > payableAmount ? receivedAmount - payableAmount : 0;
    const dueAmount = paymentMethod === 'DUE' ? payableAmount : (payableAmount > 0 && receivedAmount < payableAmount ? payableAmount - receivedAmount : 0);

    const invoiceCode = await this.getNextInvoiceCode();

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        invoice_code: invoiceCode,
        total_amount: netSubtotal,
        discount_amount: discount,
        payable_amount: payableAmount,
        payment_method: paymentMethod,
        received_amount: receivedAmount,
        change_amount: changeAmount,
        customer_phone: customerPhone,
        customer_name: customerName,
        guarantor_name: guarantorName,
        guarantor_phone: guarantorPhone,
        due_amount: dueAmount
      })
      .select()
      .single();

    if (saleError) throw saleError;

    if (sale) {
      const saleItems = cart.map(item => {
        const isReturn = item.saleType === 'RETURN';
        const itemPrice = item.customPrice !== undefined ? item.customPrice : item.variant.selling_price;

        return {
          sale_id: sale.id,
          variant_id: item.variant.id,
          quantity: item.quantity,
          unit_price: itemPrice,
          total_price: isReturn ? -(item.quantity * itemPrice) : (item.quantity * itemPrice),
          sale_type: item.saleType || 'SALE',
          is_returned: isReturn ? true : false
        };
      });
      
      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Restock inventory for returned items and record stock ledger
      for (const item of cart) {
        if (item.saleType === 'RETURN') {
          const { data: vData } = await supabase
            .from('product_variants')
            .select('stock_quantity')
            .eq('id', item.variant.id)
            .single();
          if (vData) {
            await supabase
              .from('product_variants')
              .update({ stock_quantity: (vData.stock_quantity || 0) + item.quantity })
              .eq('id', item.variant.id);
          }
          await supabase.from('stock_ledger').insert({
            variant_id: item.variant.id,
            quantity_change: item.quantity,
            transaction_type: 'RETURN',
            notes: 'POS Product Return / Exchange'
          });
        }
      }
      
      if (receivedAmount > 0) {
        try {
          await this.recordPaymentCollection({
            sale_id: sale.id,
            amount: receivedAmount,
            payment_method: paymentMethod,
            collection_type: 'INITIAL',
            collection_date: sale.sale_date || new Date().toISOString(),
            notes: 'Initial sale payment'
          });
        } catch (e) {
          console.warn('Failed to record initial payment collection:', e);
        }
      }

      clearPosCache(['sales', 'variants', 'sale_items_detailed', 'stock_ledger', 'payment_collections' as any]);
      return { id: sale.id, invoice_code: sale.invoice_code || invoiceCode };
    }
    throw new Error('Failed to checkout sale');
  },

  async deleteSale(saleId: string) {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', saleId);

    if (error) throw error;

    clearPosCache(['sales', 'variants', 'products', 'sale_items_detailed', 'stock_ledger']);
    return true;
  },

  async updateSale(
    saleId: string,
    saleData: {
      discount_amount: number;
      payment_method: string;
      received_amount: number;
      customer_phone?: string;
      customer_name?: string;
      guarantor_name?: string;
      guarantor_phone?: string;
    },
    items: {
      id?: string;
      variant_id: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      sale_type?: 'SALE' | 'RETURN';
      is_returned?: boolean;
    }[]
  ) {
    // 1. Calculate financials
    const subtotal = items.reduce((acc, it) => acc + (Number(it.quantity) * Number(it.unit_price)), 0);
    const payableAmount = Math.max(0, subtotal - (Number(saleData.discount_amount) || 0));
    const receivedAmount = Number(saleData.received_amount) || 0;
    const changeAmount = receivedAmount > payableAmount ? receivedAmount - payableAmount : 0;
    const dueAmount = saleData.payment_method === 'DUE' ? payableAmount : (receivedAmount < payableAmount ? payableAmount - receivedAmount : 0);

    // 2. Update sale header
    const updatePayload: any = {
      total_amount: subtotal,
      discount_amount: saleData.discount_amount || 0,
      payable_amount: payableAmount,
      payment_method: saleData.payment_method,
      received_amount: receivedAmount,
      change_amount: changeAmount,
      customer_phone: saleData.customer_phone || '',
      due_amount: dueAmount
    };

    if (saleData.customer_name !== undefined) updatePayload.customer_name = saleData.customer_name;
    if (saleData.guarantor_name !== undefined) updatePayload.guarantor_name = saleData.guarantor_name;
    if (saleData.guarantor_phone !== undefined) updatePayload.guarantor_phone = saleData.guarantor_phone;

    const { error: saleError } = await supabase
      .from('sales')
      .update(updatePayload)
      .eq('id', saleId);

    if (saleError) throw saleError;

    // 3. Sync sale_items:
    const { data: existingItems, error: fetchErr } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId);

    if (fetchErr) throw fetchErr;

    const existingMap = new Map((existingItems || []).map(it => [it.id, it]));
    const currentItemIds = new Set(items.filter(it => it.id).map(it => it.id!));

    // A. Items to delete (removed from invoice)
    const itemsToDelete = (existingItems || []).filter(it => !currentItemIds.has(it.id));
    if (itemsToDelete.length > 0) {
      const deleteIds = itemsToDelete.map(it => it.id);
      const { error: delErr } = await supabase
        .from('sale_items')
        .delete()
        .in('id', deleteIds);
      if (delErr) throw delErr;
    }

    // B. Items to update (existed and still in invoice)
    const itemsToUpdate = items.filter(it => it.id && existingMap.has(it.id));
    for (const item of itemsToUpdate) {
      const existing = existingMap.get(item.id!)!;
      const changed = 
        existing.quantity !== item.quantity || 
        existing.unit_price !== item.unit_price || 
        existing.variant_id !== item.variant_id ||
        existing.sale_type !== (item.sale_type || 'SALE') ||
        existing.is_returned !== (item.is_returned || false);

      if (changed) {
        const { error: upErr } = await supabase
          .from('sale_items')
          .update({
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.quantity * item.unit_price,
            sale_type: item.sale_type || 'SALE',
            is_returned: item.is_returned || false
          })
          .eq('id', item.id);
        if (upErr) throw upErr;
      }
    }

    // C. Items to insert (newly added to this invoice)
    const itemsToInsert = items.filter(it => !it.id);
    if (itemsToInsert.length > 0) {
      const newRows = itemsToInsert.map(it => ({
        sale_id: saleId,
        variant_id: it.variant_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.quantity * it.unit_price,
        sale_type: it.sale_type || 'SALE',
        is_returned: false
      }));
      const { error: insErr } = await supabase
        .from('sale_items')
        .insert(newRows);
      if (insErr) throw insErr;
    }

    clearPosCache(['sales', 'variants', 'products', 'sale_items_detailed', 'stock_ledger']);
    return true;
  },

  // --- Ultra-Fast Low Stock Count for Badge (Does not pull all sales/items) ---
  async getLowStockCount(): Promise<number> {
    const variants = await this.getVariants();
    return variants.filter(v => v.stock_quantity <= (v.min_stock_level ?? 5)).length;
  },

  // --- Reports & Analytics (Parallelized & Cached) ---
  async getDashboardStats() {
    const [variants, sales, { data: saleItems }] = await Promise.all([
      this.getVariants(),
      this.getSales(),
      supabase.from('sale_items').select('quantity, unit_price, variant_id, sale_type')
    ]);
    
    // Total Revenue (Payable, Paid, Due & Discount)
    const revenue = sales.reduce((acc: number, s: any) => acc + Number(s.payable_amount || 0), 0);
    const totalDiscount = sales.reduce((acc: number, s: any) => acc + Number(s.discount_amount || 0), 0);
    const totalPaid = sales.reduce((acc: number, s: any) => acc + Number(s.received_amount !== undefined && s.received_amount !== null ? s.received_amount : s.payable_amount || 0), 0);
    const totalDue = Math.max(0, revenue - totalPaid);
    
    // Total COGS
    let totalCogs = 0;
    if (saleItems) {
      const variantMap = new Map(variants.map(v => [v.id, v]));
      saleItems.forEach((si: any) => {
        const v = variantMap.get(si.variant_id);
        const unitCost = Number(v?.purchase_price || 0);
        totalCogs += (Number(si.quantity || 0) * unitCost);
      });
    }
    const profit = totalPaid - totalCogs;

    // Low Stock Alert Count
    const lowStockCount = variants.filter(v => v.stock_quantity <= (v.min_stock_level ?? 5)).length;

    return {
      totalRevenue: revenue,
      totalPaid,
      totalDue,
      totalDiscount,
      totalProfit: profit,
      totalSalesCount: sales.length,
      lowStockAlerts: lowStockCount,
      recentSales: sales.slice(0, 5)
    };
  },

  // --- Users & Staff Management ---
  async getUsers(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.users && (now - cache.users.timestamp < CACHE_TTL_MS)) {
      return cache.users.data;
    }

    // Read any locally-cached staff extensions & custom staff accounts
    let localExtensions: Record<string, any> = {};
    let localAccounts: Record<string, any> = {};
    try {
      const storedExt = localStorage.getItem('zenpos_staff_extensions');
      if (storedExt) localExtensions = JSON.parse(storedExt);
      const storedAcc = localStorage.getItem('zenpos_staff_accounts');
      if (storedAcc) localAccounts = JSON.parse(storedAcc);
    } catch (e) {
      console.warn('Failed to parse local staff storage', e);
    }

    let remoteUsers: any[] = [];
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        remoteUsers = data;
      }
    } catch (e) {
      console.warn('Could not fetch users table:', e);
    }

    // Merge remote users with extensions
    const mergedList = remoteUsers.map(u => {
      const ext = localExtensions[u.id] || localAccounts[u.id] || {};
      const phone = u.phone || ext.phone || (u.email && u.email.endsWith('@zenpos.local') ? u.email.replace('@zenpos.local', '') : u.phone || '');
      const isLocked = u.is_locked !== undefined ? Boolean(u.is_locked) : (ext.is_locked !== undefined ? Boolean(ext.is_locked) : false);
      
      let perms = u.permissions || ext.permissions;
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch { perms = perms.split(',').map((s: string) => s.trim()); }
      }
      if (!Array.isArray(perms) || perms.length === 0) {
        perms = u.role === 'admin' 
          ? ['pos', 'returns', 'products', 'stock', 'sales', 'expenses', 'users', 'reports']
          : ['pos', 'returns', 'sales'];
      }

      return {
        ...u,
        phone,
        is_locked: isLocked,
        permissions: perms,
        password: ext.password || u.password
      };
    });

    // Also append any local custom accounts that might not have synchronized to remote yet
    Object.values(localAccounts).forEach((acc: any) => {
      if (acc && acc.id && !mergedList.some(u => u.id === acc.id || u.phone === acc.phone)) {
        mergedList.push({
          id: acc.id,
          phone: acc.phone,
          email: acc.email || `${acc.phone}@zenpos.local`,
          full_name: acc.full_name || 'Staff Member',
          role: acc.role || 'cashier',
          is_locked: Boolean(acc.is_locked),
          permissions: acc.permissions || ['pos', 'returns', 'sales'],
          password: acc.password,
          created_at: acc.created_at || new Date().toISOString()
        });
      }
    });

    // Seed Master Administrator Account with all access
    const masterAccount = {
      id: '84787c16-4295-4b8f-bc8c-49a01fd12d77',
      email: '01825334505@zenpos.local',
      phone: '01825334505',
      full_name: 'MD Arif Uddin (Master Admin)',
      role: 'admin',
      permissions: ['pos', 'returns', 'products', 'stock', 'sales', 'expenses', 'users', 'reports'],
      is_locked: false
    };

    const ext = localExtensions[masterAccount.id];
    if (ext) {
      if (ext.permissions) masterAccount.permissions = ext.permissions;
      if (ext.full_name) masterAccount.full_name = ext.full_name;
    }

    if (!mergedList.some(u => u.id === masterAccount.id || u.phone === masterAccount.phone)) {
      mergedList.unshift(masterAccount);
    }

    cache.users = { data: mergedList, timestamp: now };
    return mergedList;
  },

  async createStaffUser(user: { id?: string; phone: string; email?: string; full_name: string; role: string; permissions?: string[]; is_locked?: boolean; password?: string }) {
    const userId = user.id || 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const cleanPhone = (user.phone || '').trim().replace(/[^0-9]/g, '');
    const email = user.email || `${cleanPhone}@zenpos.local`;

    const staffRecord = {
      id: userId,
      phone: cleanPhone,
      email,
      full_name: user.full_name || 'Staff Member',
      role: user.role || 'cashier',
      permissions: user.permissions || ['pos', 'returns', 'sales'],
      is_locked: Boolean(user.is_locked),
      password: user.password,
      created_at: new Date().toISOString()
    };

    // 1. Save to local staff registry
    try {
      let localAccounts: Record<string, any> = {};
      const stored = localStorage.getItem('zenpos_staff_accounts');
      if (stored) localAccounts = JSON.parse(stored);
      localAccounts[userId] = staffRecord;
      localStorage.setItem('zenpos_staff_accounts', JSON.stringify(localAccounts));

      let localExtensions: Record<string, any> = {};
      const storedExt = localStorage.getItem('zenpos_staff_extensions');
      if (storedExt) localExtensions = JSON.parse(storedExt);
      localExtensions[userId] = staffRecord;
      localStorage.setItem('zenpos_staff_extensions', JSON.stringify(localExtensions));
    } catch (e) {
      console.warn('Failed to save staff account locally:', e);
    }

    // 2. Try remote Supabase upsert
    try {
      await supabase.from('users').upsert({
        id: userId,
        email,
        full_name: user.full_name,
        role: user.role || 'cashier'
      });
    } catch (e) {
      console.warn('Supabase users upsert note:', e);
    }

    clearPosCache(['users']);
    return staffRecord;
  },

  async updateUserRole(id: string, role: string) {
    return this.updateStaffProfile(id, { role });
  },

  async updateStaffProfile(id: string, updates: { full_name?: string; phone?: string; role?: string; permissions?: string[]; is_locked?: boolean }) {
    // 1. Update local stores
    try {
      let localExtensions: Record<string, any> = {};
      const stored = localStorage.getItem('zenpos_staff_extensions');
      if (stored) localExtensions = JSON.parse(stored);
      localExtensions[id] = { ...(localExtensions[id] || {}), ...updates };
      localStorage.setItem('zenpos_staff_extensions', JSON.stringify(localExtensions));

      let localAccounts: Record<string, any> = {};
      const storedAcc = localStorage.getItem('zenpos_staff_accounts');
      if (storedAcc) localAccounts = JSON.parse(storedAcc);
      if (localAccounts[id]) {
        localAccounts[id] = { ...localAccounts[id], ...updates };
        localStorage.setItem('zenpos_staff_accounts', JSON.stringify(localAccounts));
      }
    } catch (e) {
      console.warn('Failed to save staff extensions to local store', e);
    }

    // 2. Try updating remote supabase users table
    try {
      const payload: any = {};
      if (updates.full_name !== undefined) payload.full_name = updates.full_name;
      if (updates.role !== undefined) payload.role = updates.role;
      if (updates.phone !== undefined) payload.phone = updates.phone;
      if (updates.is_locked !== undefined) payload.is_locked = updates.is_locked;
      if (updates.permissions !== undefined) payload.permissions = updates.permissions;

      const { data, error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', id)
        .select();

      if (error) {
        await supabase
          .from('users')
          .update({ role: updates.role, full_name: updates.full_name })
          .eq('id', id);
      }
      clearPosCache(['users']);
      return data?.[0] || { id, ...updates };
    } catch (e) {
      console.warn('Remote update fallback:', e);
      clearPosCache(['users']);
      return { id, ...updates };
    }
  },

  async toggleUserLock(id: string, isLocked: boolean) {
    return this.updateStaffProfile(id, { is_locked: isLocked });
  },

  async deleteUser(id: string) {
    try {
      let localExtensions: Record<string, any> = {};
      const stored = localStorage.getItem('zenpos_staff_extensions');
      if (stored) localExtensions = JSON.parse(stored);
      delete localExtensions[id];
      localStorage.setItem('zenpos_staff_extensions', JSON.stringify(localExtensions));

      let localAccounts: Record<string, any> = {};
      const storedAcc = localStorage.getItem('zenpos_staff_accounts');
      if (storedAcc) localAccounts = JSON.parse(storedAcc);
      delete localAccounts[id];
      localStorage.setItem('zenpos_staff_accounts', JSON.stringify(localAccounts));
    } catch (e) {
      console.warn('Failed to delete staff extension', e);
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    if (error) console.warn('Supabase delete user note:', error);
    clearPosCache(['users']);
  },

  async getUserProfile(userId: string): Promise<{ role: string; permissions: string[]; is_locked: boolean; phone?: string; full_name?: string } | null> {
    try {
      const users = await this.getUsers(true);
      const matched = users.find(u => u.id === userId || u.email === userId || u.phone === userId);
      if (matched) {
        return {
          role: matched.role || 'cashier',
          permissions: matched.permissions || ['pos', 'returns', 'sales'],
          is_locked: Boolean(matched.is_locked),
          phone: matched.phone || '',
          full_name: matched.full_name || ''
        };
      }
    } catch (e) {
      console.warn('Could not fetch user profile:', e);
    }
    return null;
  },

  async getUserRole(userId: string, fallbackRole = 'cashier'): Promise<string> {
    const profile = await this.getUserProfile(userId);
    return profile?.role || fallbackRole;
  },

  async getSaleItemsDetailed(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.sale_items_detailed && (now - cache.sale_items_detailed.timestamp < CACHE_TTL_MS)) {
      return cache.sale_items_detailed.data;
    }
    const { data, error } = await supabase
      .from('sale_items')
      .select('*, sale:sales(*)');
    if (error) throw error;
    const result = data || [];
    cache.sale_items_detailed = { data: result, timestamp: now };
    return result;
  },

  async recordPaymentCollection(item: {
    sale_id: string;
    amount: number;
    payment_method: string;
    collection_type?: 'INITIAL' | 'DUE_COLLECTION';
    collection_date?: string;
    notes?: string;
  }) {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `pc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const fullItem = {
      id,
      ...item,
      collection_type: item.collection_type || 'DUE_COLLECTION',
      collection_date: item.collection_date || new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    // 1. Try inserting to Supabase table
    try {
      const { data, error } = await supabase
        .from('payment_collections')
        .insert({
          sale_id: fullItem.sale_id,
          amount: fullItem.amount,
          payment_method: fullItem.payment_method,
          collection_type: fullItem.collection_type,
          collection_date: fullItem.collection_date,
          notes: fullItem.notes || null
        })
        .select()
        .single();
      if (!error && data) {
        fullItem.id = data.id;
      }
    } catch (e) {
      console.warn('payment_collections Supabase insert skipped (falling back to local cache):', e);
    }

    // 2. Always persist in local storage
    try {
      const local = JSON.parse(localStorage.getItem('zenpos_payment_collections') || '[]');
      local.push(fullItem);
      localStorage.setItem('zenpos_payment_collections', JSON.stringify(local));
    } catch (e) {
      console.warn('Failed to update local payment_collections:', e);
    }

    clearPosCache(['sales', 'payment_collections' as any]);
    return fullItem;
  },

  async getPaymentCollections(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && (cache as any).payment_collections && (now - (cache as any).payment_collections.timestamp < CACHE_TTL_MS)) {
      return (cache as any).payment_collections.data;
    }

    let remoteList: any[] = [];
    try {
      const { data, error } = await supabase
        .from('payment_collections')
        .select('*')
        .order('collection_date', { ascending: false });
      if (!error && data) {
        remoteList = data;
      }
    } catch {
      // Table might not exist yet
    }

    let localList: any[] = [];
    try {
      localList = JSON.parse(localStorage.getItem('zenpos_payment_collections') || '[]');
    } catch {
      localList = [];
    }

    const map = new Map<string, any>();
    remoteList.forEach(it => {
      const k = it.id || `${it.sale_id}_${it.collection_date}_${it.amount}`;
      map.set(k, it);
    });
    localList.forEach(it => {
      const k = it.id || `${it.sale_id}_${it.collection_date}_${it.amount}`;
      if (!map.has(k)) {
        map.set(k, it);
      }
    });

    const result = Array.from(map.values()).sort((a, b) =>
      new Date(b.collection_date).getTime() - new Date(a.collection_date).getTime()
    );

    (cache as any).payment_collections = { data: result, timestamp: now };
    return result;
  },

  async getStockLedger(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.stock_ledger && (now - cache.stock_ledger.timestamp < CACHE_TTL_MS)) {
      return cache.stock_ledger.data;
    }
    const { data, error } = await supabase
      .from('stock_ledger')
      .select('*, variant:product_variants(*, product:products(*))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const result = data || [];
    cache.stock_ledger = { data: result, timestamp: now };
    return result;
  },

  // --- Expenses ---
  async getExpenses(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.expenses && (now - cache.expenses.timestamp < CACHE_TTL_MS)) {
      return cache.expenses.data;
    }

    let localExpenses: any[] = [];
    try {
      const stored = localStorage.getItem('zenpos_local_expenses');
      if (stored) localExpenses = JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse local expenses', e);
    }

    let remoteExpenses: any[] = [];
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (!error && data) {
        remoteExpenses = data;
      }
    } catch (e) {
      console.warn('Could not query remote expenses table:', e);
    }

    // Merge remote and local (avoiding duplicates by id)
    const seenIds = new Set(remoteExpenses.map(e => e.id));
    const merged = [
      ...remoteExpenses,
      ...localExpenses.filter(e => !seenIds.has(e.id))
    ];

    merged.sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime());

    cache.expenses = { data: merged, timestamp: now };
    return merged;
  },

  async addExpense(category: string, amount: number, description: string) {
    const newId = 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const nowIso = new Date().toISOString();
    const newRecord = {
      id: newId,
      category,
      amount: Number(amount),
      description: description || '',
      expense_date: nowIso,
      created_at: nowIso
    };

    // 1. Try remote Supabase insert
    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          category,
          amount: Number(amount),
          description: description || '',
          expense_date: nowIso
        })
        .select()
        .single();
      if (!error && data) {
        clearPosCache(['expenses']);
        return data;
      }
    } catch (e) {
      console.warn('Supabase expense insert error, using local storage fallback:', e);
    }

    // 2. Local fallback if Supabase table or RLS policy restricts direct anon insert
    try {
      let localExpenses: any[] = [];
      const stored = localStorage.getItem('zenpos_local_expenses');
      if (stored) localExpenses = JSON.parse(stored);
      localExpenses.unshift(newRecord);
      localStorage.setItem('zenpos_local_expenses', JSON.stringify(localExpenses));
    } catch (e) {
      console.warn('Failed to save expense locally:', e);
    }

    clearPosCache(['expenses']);
    return newRecord;
  },

  async deleteExpense(id: string) {
    // 1. Try remote delete
    try {
      await supabase
        .from('expenses')
        .delete()
        .eq('id', id);
    } catch (e) {
      console.warn('Supabase delete expense error:', e);
    }

    // 2. Remove from local store
    try {
      let localExpenses: any[] = [];
      const stored = localStorage.getItem('zenpos_local_expenses');
      if (stored) localExpenses = JSON.parse(stored);
      localExpenses = localExpenses.filter(e => e.id !== id);
      localStorage.setItem('zenpos_local_expenses', JSON.stringify(localExpenses));
    } catch (e) {
      console.warn('Failed to update local expenses after delete:', e);
    }

    clearPosCache(['expenses']);
  },

  async updateExpense(id: string, updates: { category?: string; amount?: number; description?: string; expense_date?: string }) {
    // 1. Try remote update
    try {
      const payload: any = {};
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.amount !== undefined) payload.amount = Number(updates.amount);
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.expense_date !== undefined) payload.expense_date = updates.expense_date;

      const { data, error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        clearPosCache(['expenses']);
      }
    } catch (e) {
      console.warn('Supabase update expense error:', e);
    }

    // 2. Update in local store
    try {
      let localExpenses: any[] = [];
      const stored = localStorage.getItem('zenpos_local_expenses');
      if (stored) localExpenses = JSON.parse(stored);
      const index = localExpenses.findIndex(e => e.id === id);
      if (index !== -1) {
        localExpenses[index] = { ...localExpenses[index], ...updates };
        localStorage.setItem('zenpos_local_expenses', JSON.stringify(localExpenses));
      }
    } catch (e) {
      console.warn('Failed to update local expense:', e);
    }

    clearPosCache(['expenses']);
  }
};
