import React, { useState } from 'react';
import type { ProductVariant } from '../store';
import { dbService } from '../dbService';
import { useNotificationStore } from '../store';
import { X, Check } from 'lucide-react';

interface StockAdjustmentModalProps {
  variant?: ProductVariant | null;
  variantsList?: ProductVariant[];
  onClose: () => void;
  onSuccess: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  variant,
  variantsList = [],
  onClose,
  onSuccess
}) => {
  const { showToast } = useNotificationStore();

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    variant?.id || (variantsList.length > 0 ? variantsList[0].id : '')
  );

  const currentVariant = variant || variantsList.find(v => v.id === selectedVariantId);
  const currentStock = currentVariant?.stock_quantity ?? 0;

  const [mode, setMode] = useState<'add' | 'subtract'>('add');
  const [qtyValue, setQtyValue] = useState<number | ''>(1);
  const [saving, setSaving] = useState(false);

  const numQty = typeof qtyValue === 'number' ? qtyValue : 0;
  const targetStock = mode === 'add'
    ? currentStock + numQty
    : Math.max(0, currentStock - numQty);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVariant) return;

    const qty = Math.max(1, Number(qtyValue) || 1);
    const finalStock = mode === 'add'
      ? currentStock + qty
      : Math.max(0, currentStock - qty);

    try {
      setSaving(true);
      const note = mode === 'add' ? `Stock added (+${qty})` : `Stock removed (-${qty})`;
      await dbService.adjustStock(currentVariant.id, finalStock, note);

      showToast(
        `Stock updated to ${finalStock} units (${mode === 'add' ? `+${qty}` : `-${qty}`}).`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to update stock', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1100,
      padding: '16px'
    }}>
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '360px',
          padding: '22px',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Adjust Stock
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Variant Dropdown if general modal */}
        {!variant && variantsList.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Select Product Variant:
            </label>
            <select
              className="form-control"
              value={selectedVariantId}
              onChange={e => setSelectedVariantId(e.target.value)}
              style={{ height: '36px', fontSize: '12.5px' }}
            >
              {variantsList.map(v => (
                <option key={v.id} value={v.id}>
                  {v.product?.name} — Stock: {v.stock_quantity}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Product Summary */}
        {currentVariant && (
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                {currentVariant.product?.name}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>CURRENT</div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-primary)' }}>
                {currentStock}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Action Tabs: + Add or - Remove */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setMode('add')}
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                border: '1.5px solid',
                borderColor: mode === 'add' ? '#10b981' : '#e2e8f0',
                backgroundColor: mode === 'add' ? '#f0fdf4' : '#ffffff',
                color: mode === 'add' ? '#166534' : '#64748b',
                transition: 'all 0.12s'
              }}
            >
              + Add Stock
            </button>

            <button
              type="button"
              onClick={() => setMode('subtract')}
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                border: '1.5px solid',
                borderColor: mode === 'subtract' ? '#f43f5e' : '#e2e8f0',
                backgroundColor: mode === 'subtract' ? '#fff1f2' : '#ffffff',
                color: mode === 'subtract' ? '#991b1b' : '#64748b',
                transition: 'all 0.12s'
              }}
            >
              - Remove Stock
            </button>
          </div>

          {/* Simple Quantity Input */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '12px', margin: 0 }}>
                Quantity to {mode === 'add' ? 'Add' : 'Remove'}
              </label>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                New Stock: <strong style={{ color: mode === 'subtract' ? '#e11d48' : '#10b981' }}>{targetStock}</strong>
              </span>
            </div>
            <input
              type="number"
              min="1"
              className="form-control"
              value={qtyValue}
              onChange={e => {
                const val = e.target.value;
                setQtyValue(val === '' ? '' : Math.max(1, parseInt(val) || 1));
              }}
              placeholder="1"
              required
              autoFocus
              style={{
                height: '42px',
                fontSize: '17px',
                fontWeight: 800,
                textAlign: 'center'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !qtyValue || numQty <= 0}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: mode === 'subtract' ? '#e11d48' : '#10b981',
                borderColor: mode === 'subtract' ? '#e11d48' : '#10b981',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Check size={15} />
              {saving ? 'Saving...' : (mode === 'add' ? `Add ${numQty} Units` : `Remove ${numQty} Units`)}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

