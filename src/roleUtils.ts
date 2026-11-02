export type AppRole = 'admin' | 'manager' | 'cashier' | 'sales_executive' | string;

export type AppModuleId = 
  | 'pos' 
  | 'returns' 
  | 'products' 
  | 'stock' 
  | 'sales' 
  | 'expenses' 
  | 'users' 
  | 'reports';

export interface ModuleDefinition {
  id: AppModuleId;
  name: string;
  label: string;
  shortName: string;
  color: string;
}

export const ALL_APP_MODULES: ModuleDefinition[] = [
  { id: 'pos', name: 'POS Checkout', label: 'POS Checkout', shortName: 'POS', color: '#1d4ed8' },
  { id: 'returns', name: 'Returns & Exchanges', label: 'Returns & Exchanges', shortName: 'Returns', color: '#dc2626' },
  { id: 'products', name: 'Product Catalog', label: 'Products & Variants', shortName: 'Products', color: '#0284c7' },
  { id: 'stock', name: 'Stock & Inventory', label: 'Stock & Inventory', shortName: 'Stock', color: '#d97706' },
  { id: 'sales', name: 'Sales History', label: 'Sales Invoices Ledger', shortName: 'Sales', color: '#2563eb' },
  { id: 'expenses', name: 'Expenses', label: 'Operating Expenses', shortName: 'Expenses', color: '#e11d48' },
  { id: 'users', name: 'Staff Management', label: 'Staff & Permissions', shortName: 'Staff', color: '#4f46e5' },
  { id: 'reports', name: 'Reports', label: 'Business Analytics & Reports', shortName: 'Reports', color: '#059669' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, AppModuleId[]> = {
  admin: ['pos', 'returns', 'products', 'stock', 'sales', 'expenses', 'users', 'reports'],
  manager: ['pos', 'returns', 'products', 'stock', 'sales', 'expenses', 'reports'],
  cashier: ['pos', 'returns', 'sales'],
  sales_executive: ['pos', 'returns', 'sales'],
};

export const STAFF_ROLES = [
  { value: 'cashier', label: 'Cashier' },
  { value: 'sales_executive', label: 'Sales Executive' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrator' },
] as const;

/**
 * Returns true if the user's role is Cashier or Sales Executive.
 */
export const isRestrictedStaffRole = (role?: string | null): boolean => {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[-_]/g, ' ').trim();
  return normalized === 'cashier' || normalized === 'sales executive';
};

/**
 * Returns true if the user's role is Admin / Administrator.
 */
export const isAdminRole = (role?: string | null): boolean => {
  if (role) {
    const normalized = role.toLowerCase().trim();
    return normalized === 'admin' || normalized === 'administrator';
  }
  // Fallback to checking active session in localStorage
  try {
    const mockSessionStr = localStorage.getItem('sb-mock-session');
    if (mockSessionStr) {
      const parsed = JSON.parse(mockSessionStr);
      const sessionRole = parsed?.user?.user_metadata?.role || (parsed?.user?.email === 'admin@zenpos.local' || parsed?.user?.email === 'admin@gmail.com' ? 'admin' : '');
      const norm = (sessionRole || '').toLowerCase().trim();
      return norm === 'admin' || norm === 'administrator';
    }
  } catch {
    // Ignore error
  }
  return false;
};

/**
 * Checks if user has permission to access a specific module
 */
export const hasModuleAccess = (
  userPermissions: string[] | undefined | null,
  userRole?: string | null,
  moduleId?: string
): boolean => {
  if (!moduleId) return false;
  const normRole = (userRole || '').toLowerCase().trim();
  if (normRole === 'admin' || normRole === 'administrator') return true;

  if (Array.isArray(userPermissions) && userPermissions.length > 0) {
    if (userPermissions.includes('*')) return true;
    return userPermissions.includes(moduleId);
  }

  // Fallback to default role permissions
  const defaults = DEFAULT_ROLE_PERMISSIONS[normRole] || DEFAULT_ROLE_PERMISSIONS.cashier;
  return defaults.includes(moduleId as AppModuleId);
};

/**
 * Formats a role value into a clean, human-readable label
 */
export const formatRoleName = (role?: string | null): string => {
  if (!role) return 'Cashier';
  const normalized = role.toLowerCase().replace(/[-_]/g, ' ').trim();
  if (normalized === 'admin' || normalized === 'administrator') return 'Administrator';
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'sales executive') return 'Sales Executive';
  if (normalized === 'cashier') return 'Cashier';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

/**
 * Normalizes phone numbers (e.g. removes spaces, dashes, country code prefixes)
 */
export const cleanPhoneInput = (input: string): string => {
  return (input || '').replace(/[^0-9]/g, '').trim();
};

