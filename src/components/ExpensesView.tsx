import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useNotificationStore } from '../store';
import { Plus, Trash2, Edit2, FileDown } from 'lucide-react';
import { Pagination } from './Pagination';
import { exportTableToPdf } from '../utils/pdfExport';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isAdminRole } from '../roleUtils';

interface ExpensesViewProps {
  onRefreshStats: () => void;
  userRole?: string;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ onRefreshStats, userRole }) => {
  const { showToast, showConfirm } = useNotificationStore();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form State (Add)
  const [category, setCategory] = useState('Utilities');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');

  // Form State (Edit)
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editCategory, setEditCategory] = useState('Utilities');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const list = await dbService.getExpenses();
      setExpenses(list);
    } catch (e) {
      console.error('Failed to load expenses list', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      showToast('Please enter a valid amount.', 'warning');
      return;
    }

    try {
      setSaving(true);
      showToast('Saving expense...', 'info');
      await dbService.addExpense(category, amount, description);
      setShowAddModal(false);
      setCategory('Utilities');
      setAmount(0);
      setDescription('');
      await loadExpenses();
      onRefreshStats();
      showToast('Expense logged successfully!', 'success');
    } catch (err: any) {
      console.error('Error logging expense:', err);
      showToast(err?.message || 'Error logging expense.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (exp: any) => {
    setEditingExpense(exp);
    setEditCategory(exp.category || 'Utilities');
    setEditAmount(Number(exp.amount) || 0);
    setEditDescription(exp.description || '');
    
    // Format date as YYYY-MM-DD
    const d = exp.expense_date ? new Date(exp.expense_date) : new Date();
    const dateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    setEditDate(dateStr);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    if (editAmount <= 0) {
      showToast('Please enter a valid expense amount.', 'warning');
      return;
    }

    try {
      setSavingEdit(true);
      showToast('Updating expense...', 'info');
      const isoDate = editDate ? new Date(editDate).toISOString() : editingExpense.expense_date;
      await dbService.updateExpense(editingExpense.id, {
        category: editCategory,
        amount: editAmount,
        description: editDescription,
        expense_date: isoDate
      });

      setEditingExpense(null);
      await loadExpenses();
      onRefreshStats();
      showToast('Expense updated successfully!', 'success');
    } catch (err: any) {
      console.error('Error updating expense:', err);
      showToast(err?.message || 'Failed to update expense', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    showConfirm(
      'Delete Expense Record',
      'Are you sure you want to delete this expense record? This action cannot be undone.',
      async () => {
        try {
          setDeletingId(id);
          showToast('Deleting expense...', 'info');
          await dbService.deleteExpense(id);
          await loadExpenses();
          onRefreshStats();
          showToast('Expense record deleted.', 'success');
        } catch (err: any) {
          console.error('Error deleting expense:', err);
          showToast(err?.message || 'Error deleting expense', 'error');
        } finally {
          setDeletingId(null);
        }
      }
    );
  };

  const handleDownloadPdf = () => {
    const totalExp = expenses.reduce((acc, exp) => acc + Number(exp.amount || 0), 0);
    exportTableToPdf({
      moduleName: 'Expenses',
      title: 'Operating Expenses Ledger Report',
      summaryCards: [
        { label: 'Total Expense Records', value: String(expenses.length) },
        { label: 'Total Expenses Value', value: `৳${totalExp.toFixed(2)}` }
      ],
      columns: [
        { header: 'Expense Date', key: 'expense_date', format: (v) => formatDateDDMMYYYY(v) },
        { header: 'Category', key: 'category' },
        { header: 'Description', key: 'description' },
        { header: 'Amount', key: 'amount', align: 'right', format: (v) => `৳${Number(v || 0).toFixed(2)}` }
      ],
      data: expenses
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
        {isAdminRole(userRole) && (
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={handleDownloadPdf}
            style={{ gap: '6px', fontWeight: 700 }}
            title="Download Expenses PDF"
          >
            <FileDown size={14} /> Download PDF
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
          <Plus size={15} /> Log New Expense
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '16px', fontSize: '13px' }}>Loading expense ledger...</div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="desktop-cart-table table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                  <th>Expense Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: '135px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                      No expenses logged yet.
                    </td>
                  </tr>
                ) : (
                  expenses
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map((exp, idx) => (
                    <tr key={exp.id}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{formatDateDDMMYYYY(exp.expense_date)}</td>
                      <td>
                        <span style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: 'var(--color-danger)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>{exp.category}</span>
                      </td>
                      <td style={{ fontSize: '12.5px', color: exp.description ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {exp.description || 'No description provided'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: 'var(--color-danger)' }}>
                        ৳{exp.amount.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} 
                            onClick={() => handleStartEdit(exp)}
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button 
                            className="btn btn-danger btn-sm" 
                            style={{ padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} 
                            onClick={() => handleDeleteExpense(exp.id)} 
                            disabled={deletingId === exp.id}
                          >
                            {deletingId === exp.id ? '...' : <><Trash2 size={12} /> Delete</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination 
              currentPage={currentPage}
              totalItems={expenses.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>

          {/* Mobile Cards View */}
          <div className="mobile-cart-list" style={{ flexDirection: 'column', gap: '8px' }}>
            {expenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                No expenses logged yet.
              </div>
            ) : (
              expenses
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((exp) => (
                <div className="card" key={exp.id} style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      color: 'var(--color-danger)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>{exp.category}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ width: '26px', height: '26px', padding: 0 }} 
                        onClick={() => handleStartEdit(exp)}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button 
                        className="btn btn-danger btn-sm" 
                        style={{ width: '26px', height: '26px', padding: 0 }} 
                        onClick={() => handleDeleteExpense(exp.id)} 
                        disabled={deletingId === exp.id}
                      >
                        {deletingId === exp.id ? '...' : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {exp.description || 'No description provided'}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef2f2', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                    <span>Date: <span style={{ fontWeight: 600 }}>{formatDateDDMMYYYY(exp.expense_date)}</span></span>
                    <span>Amount: <span style={{ fontWeight: 800, color: 'var(--color-danger)' }}>৳{exp.amount.toFixed(2)}</span></span>
                  </div>
                </div>
              ))
            )}
            <Pagination 
              currentPage={currentPage}
              totalItems={expenses.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </>
      )}

      {/* LOG NEW EXPENSE MODAL */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '12px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '380px', padding: '18px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 800 }}>Log Business Expense</h3>
            <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div className="form-group">
                <label className="form-label">Expense Category *</label>
                <select 
                  className="form-control" 
                  value={category} 
                  onChange={e => setCategory(e.target.value)}
                  required
                >
                  <option value="Utilities">Utilities (Electricity, Internet, Water)</option>
                  <option value="Rent">Rent (Shop/Warehouse)</option>
                  <option value="Salary">Staff Salaries</option>
                  <option value="Food & Tea">Food, Tea & Entertainment</option>
                  <option value="Packaging">Packaging Material</option>
                  <option value="Marketing">Marketing & Ads</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Amount (৳) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-control" 
                  value={amount || ''} 
                  onChange={e => setAmount(Number(e.target.value))} 
                  required 
                  placeholder="0.00" 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description / Remarks</label>
                <textarea 
                  className="form-control" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="Details of the expense..." 
                  rows={2} 
                  style={{ height: 'auto' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Logging...' : 'Log Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXPENSE MODAL */}
      {editingExpense && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '12px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '380px', padding: '18px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 800 }}>Edit Expense Record</h3>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div className="form-group">
                <label className="form-label">Expense Category *</label>
                <select 
                  className="form-control" 
                  value={editCategory} 
                  onChange={e => setEditCategory(e.target.value)}
                  required
                >
                  <option value="Utilities">Utilities (Electricity, Internet, Water)</option>
                  <option value="Rent">Rent (Shop/Warehouse)</option>
                  <option value="Salary">Staff Salaries</option>
                  <option value="Food & Tea">Food, Tea & Entertainment</option>
                  <option value="Packaging">Packaging Material</option>
                  <option value="Marketing">Marketing & Ads</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Amount (৳) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-control" 
                  value={editAmount || ''} 
                  onChange={e => setEditAmount(Number(e.target.value))} 
                  required 
                  placeholder="0.00" 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Expense Date *</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={editDate} 
                  onChange={e => setEditDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description / Remarks</label>
                <textarea 
                  className="form-control" 
                  value={editDescription} 
                  onChange={e => setEditDescription(e.target.value)} 
                  placeholder="Details of the expense..." 
                  rows={2} 
                  style={{ height: 'auto' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingExpense(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
