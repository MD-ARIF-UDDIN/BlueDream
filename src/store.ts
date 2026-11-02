import { create } from 'zustand';

export interface Product {
  id: string;
  name: string;
  category: string;
  brand?: string;
  description?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  barcode: string;
  size?: string;
  color?: string;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  min_stock_level: number;
  product?: Product; // joined
}

export interface CartItem {
  variant: ProductVariant;
  quantity: number;
  discount: number; // Flat discount per item
  customPrice?: number; // Custom inputted price
  saleType?: 'SALE' | 'RETURN';
}

interface POSState {
  cart: CartItem[];
  discount: number; // Global flat discount
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_PAY';
  receivedAmount: number;
  addToCart: (variant: ProductVariant, saleType?: 'SALE' | 'RETURN', customPrice?: number) => void;
  removeFromCart: (variantId: string, saleType?: 'SALE' | 'RETURN') => void;
  updateCartQty: (variantId: string, quantity: number, saleType?: 'SALE' | 'RETURN') => void;
  updateCartPrice: (variantId: string, price: number, saleType?: 'SALE' | 'RETURN') => void;
  updateCartSaleType: (variantId: string, currentSaleType: 'SALE' | 'RETURN', newSaleType: 'SALE' | 'RETURN') => void;
  clearCart: () => void;
  setDiscount: (discount: number) => void;
  setPaymentMethod: (method: 'CASH' | 'CARD' | 'MOBILE_PAY') => void;
  setReceivedAmount: (amount: number) => void;
}

export const usePOSStore = create<POSState>((set) => ({
  cart: [],
  discount: 0,
  paymentMethod: 'CASH',
  receivedAmount: 0,

  addToCart: (variant, saleType = 'SALE', customPrice) => set((state) => {
    const defaultPrice = variant.selling_price;
    const finalPrice = customPrice !== undefined ? customPrice : defaultPrice;

    const existingIndex = state.cart.findIndex(
      item => item.variant.id === variant.id && (item.saleType || 'SALE') === saleType
    );

    if (existingIndex > -1) {
      const updatedCart = [...state.cart];
      updatedCart[existingIndex].quantity += 1;
      return { cart: updatedCart };
    }

    return {
      cart: [
        ...state.cart,
        {
          variant,
          quantity: 1,
          discount: 0,
          customPrice: finalPrice,
          saleType
        }
      ]
    };
  }),

  removeFromCart: (variantId, saleType) => set((state) => ({
    cart: state.cart.filter(item => 
      !(item.variant.id === variantId && (!saleType || (item.saleType || 'SALE') === saleType))
    )
  })),

  updateCartQty: (variantId, quantity, saleType) => set((state) => ({
    cart: state.cart.map(item => 
      (item.variant.id === variantId && (!saleType || (item.saleType || 'SALE') === saleType))
        ? { ...item, quantity: Math.max(1, quantity) } 
        : item
    )
  })),

  updateCartPrice: (variantId, price, saleType) => set((state) => ({
    cart: state.cart.map(item =>
      (item.variant.id === variantId && (!saleType || (item.saleType || 'SALE') === saleType))
        ? { ...item, customPrice: Math.max(0, price) }
        : item
    )
  })),

  updateCartSaleType: (variantId, currentSaleType, newSaleType) => set((state) => ({
    cart: state.cart.map(item => {
      if (item.variant.id === variantId && (item.saleType || 'SALE') === currentSaleType) {
        return {
          ...item,
          saleType: newSaleType,
          customPrice: item.variant.selling_price
        };
      }
      return item;
    })
  })),

  clearCart: () => set({ cart: [], discount: 0, receivedAmount: 0, paymentMethod: 'CASH' }),
  setDiscount: (discount) => set({ discount: Math.max(0, discount) }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setReceivedAmount: (receivedAmount) => set({ receivedAmount }),
}));

interface ToastInfo {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface ConfirmOptions {
  confirmInputText?: string | string[];
  confirmInputPlaceholder?: string;
  confirmInputLabel?: string;
  confirmButtonText?: string;
}

export interface ModalInfo {
  title: string;
  message: string;
  type: 'alert' | 'confirm';
  confirmInputText?: string | string[];
  confirmInputPlaceholder?: string;
  confirmInputLabel?: string;
  confirmButtonText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface NotificationState {
  toasts: ToastInfo[];
  modal: ModalInfo | null;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  removeToast: (id: string) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    onCancel?: () => void,
    options?: ConfirmOptions
  ) => void;
  showAlert: (title: string, message: string) => void;
  closeModal: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  toasts: [],
  modal: null,
  showToast: (message, type = 'success') => set((state) => {
    const id = Math.random().toString(36).substring(2, 9);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
    return { toasts: [...state.toasts, { id, message, type }] };
  }),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),
  showConfirm: (title, message, onConfirm, onCancel, options) => set({
    modal: {
      title,
      message,
      type: 'confirm',
      onConfirm,
      onCancel,
      confirmInputText: options?.confirmInputText,
      confirmInputPlaceholder: options?.confirmInputPlaceholder,
      confirmInputLabel: options?.confirmInputLabel,
      confirmButtonText: options?.confirmButtonText
    }
  }),
  showAlert: (title, message) => set({
    modal: { title, message, type: 'alert' }
  }),
  closeModal: () => set({ modal: null })
}));
