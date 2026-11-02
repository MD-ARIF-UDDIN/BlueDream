import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Shirt, TrendingUp, AlertTriangle, Users, FileText, X, Receipt, RotateCcw, ChevronDown, ChevronRight, BarChart2, Package } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { hasModuleAccess } from '../roleUtils';

interface SidebarProps {
  currentTab?: string;
  setTab?: (tab: string) => void;
  lowStockCount: number;
  isOpen?: boolean;
  onClose?: () => void;
  userRole?: string;
  userPermissions?: string[];
}

export const Sidebar: React.FC<SidebarProps> = ({ lowStockCount: _lowStockCount, isOpen, onClose, userRole, userPermissions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname.substring(1) || 'pos';

  // Auto-expand the Reports group if currently on a reports page
  const isOnReports = location.pathname.startsWith('/reports');
  const [reportsExpanded, setReportsExpanded] = useState(isOnReports);

  interface MenuItem {
    id: string;
    path: string;
    label: string;
    icon: any;
    badge?: number;
  }

  const allMenuItems: MenuItem[] = [
    { id: 'pos', path: '/pos', label: 'POS Checkout', icon: ShoppingCart },
    { id: 'returns', path: '/returns', label: 'Returns & Exchanges', icon: RotateCcw },
    { id: 'products', path: '/products', label: 'Products', icon: Shirt },
    { id: 'stock', path: '/stock', label: 'Stock & Inventory', icon: AlertTriangle },
    { id: 'sales', path: '/sales', label: 'Sales History', icon: FileText },
    { id: 'expenses', path: '/expenses', label: 'Expenses', icon: Receipt },
    { id: 'users', path: '/users', label: 'Staff Management', icon: Users },
  ];

  // Dynamically filter menu items based on staff permissions and role
  const menuItems = allMenuItems.filter(item =>
    hasModuleAccess(userPermissions, userRole, item.id)
  );

  const hasReportsAccess = hasModuleAccess(userPermissions, userRole, 'reports');

  const handleItemClick = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleReportsToggle = () => {
    setReportsExpanded(prev => !prev);
  };

  const handleReportsSubClick = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const isActivePath = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header" style={{ position: 'relative' }}>
        {onClose && (
          <button
            className="mobile-close-btn"
            onClick={onClose}
            style={{
              position: 'absolute',
              right: '8px',
              top: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        )}
        <img
          src={logoImg}
          alt="Blue Dream Logo"
          style={{
            width: '48px',
            height: '48px',
            objectFit: 'contain',
            borderRadius: '10px',
            padding: '2px',
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(29, 78, 216, 0.08)',
            border: '1px solid #e2e8f0'
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="sidebar-logo" style={{ color: 'var(--color-primary)', fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: '15px', letterSpacing: '1px', lineHeight: 1.2 }}>
            Blue Dream
          </span>
          <span className="sidebar-subtitle" style={{
            display: 'block',
            fontSize: '8.5px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '1.2px',
            fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif"
          }}>

          </span>
        </div>
      </div>
      <ul className="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <a
                onClick={() => handleItemClick(item.path)}
                className={`sidebar-item ${activePath === item.id || location.pathname === item.path ? 'active' : ''}`}
                style={{ position: 'relative', cursor: 'pointer' }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'var(--color-danger)',
                      color: 'white',
                      fontSize: '9.5px',
                      fontWeight: 'bold',
                      padding: '1px 5px',
                      borderRadius: '8px',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </a>
            </li>
          );
        })}

        {/* Reports collapsible group */}
        {hasReportsAccess && (
          <li>
            {/* Reports parent toggle */}
            <a
              onClick={handleReportsToggle}
              className={`sidebar-item ${isOnReports ? 'active' : ''}`}
              style={{ position: 'relative', cursor: 'pointer', justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <TrendingUp size={17} />
                <span>Reports</span>
              </span>
              {reportsExpanded
                ? <ChevronDown size={14} style={{ opacity: 0.6 }} />
                : <ChevronRight size={14} style={{ opacity: 0.6 }} />
              }
            </a>

            {/* Sub-menu items */}
            {reportsExpanded && (
              <ul style={{ listStyle: 'none', margin: 0, padding: '2px 0 4px 0' }}>
                <li>
                  <a
                    onClick={() => handleReportsSubClick('/reports')}
                    className={`sidebar-item ${location.pathname === '/reports' ? 'active' : ''}`}
                    style={{
                      cursor: 'pointer',
                      paddingLeft: '36px',
                      fontSize: '12.5px',
                    }}
                  >
                    <BarChart2 size={14} />
                    <span>Sales Report</span>
                  </a>
                </li>
                <li>
                  <a
                    onClick={() => handleReportsSubClick('/reports/inventory')}
                    className={`sidebar-item ${isActivePath('/reports/inventory') ? 'active' : ''}`}
                    style={{
                      cursor: 'pointer',
                      paddingLeft: '36px',
                      fontSize: '12.5px',
                    }}
                  >
                    <Package size={14} />
                    <span>Inventory Report</span>
                  </a>
                </li>
              </ul>
            )}
          </li>
        )}
      </ul>
      <div style={{ marginTop: 'auto', padding: '10px 12px', borderTop: '1px solid var(--border-color)', fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>ZenPOS V1</div>
        <div style={{ marginTop: '2px', fontSize: '10px' }}>
          By: <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>MD Arif Uddin</span>
          <br />
          <a
            href="https://wa.me/8801825334505"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-primary)',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              marginTop: '2px'
            }}
          >
            💬 01825334505
          </a>
        </div>
      </div>
    </aside>
  );
};

