
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus } from '../types';
import { formatCurrency } from '../utils/helpers';
import { Search, ChevronRight, Trash2, CheckSquare, Square, Truck, Printer, ExternalLink, ChevronLeft, Loader2 } from 'lucide-react';

interface OrderListProps {
  tenantId: string;
  onSelectOrder: (orderId: string) => void;
  status?: OrderStatus | 'ALL' | 'TODAY_SHIPPED';
  productId?: string | null;
  startDate?: string;
  endDate?: string;
  logisticsOnly?: boolean;
  onBulkAction?: (orderIds: string[]) => void;
  onRefresh?: () => void;
}

export const OrderList: React.FC<OrderListProps> = ({ 
  tenantId, 
  onSelectOrder, 
  status = 'ALL', 
  productId, 
  startDate, 
  endDate, 
  logisticsOnly = false, 
  onBulkAction, 
  onRefresh 
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(50);
  
  const [customerHistories, setCustomerHistories] = useState<{[key: string]: any}>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgressMsg, setBulkProgressMsg] = useState('');

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [status, productId, startDate, endDate, debouncedSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await db.getOrders({
        tenantId,
        page: currentPage,
        limit,
        search: debouncedSearch,
        status: status,
        productId: productId || undefined,
        startDate,
        endDate
      });

      setOrders(response.data);
      setTotalCount(response.total);
      
      if (response.data.length > 0) {
        const uniquePhones = [...new Set(response.data.map(o => o.customerPhone))];
        const historyResults = await Promise.all(uniquePhones.map(async (phone) => {
          const h = await db.getCustomerHistory(phone, tenantId);
          return { phone, h };
        }));
        
        const historyMap: any = {};
        historyResults.forEach(res => { 
          historyMap[res.phone.slice(-8)] = res.h; 
        });
        setCustomerHistories(historyMap);
      }
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, currentPage, limit, debouncedSearch, status, productId, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOrderClick = (e: React.MouseEvent, orderId: string) => {
    if (e.ctrlKey || e.metaKey) {
      const url = `${window.location.origin}${window.location.pathname}?orderId=${orderId}`;
      window.open(url, '_blank');
    } else {
      onSelectOrder(orderId);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`CRITICAL: Registry Wipe. Permanent removal of ${selectedIds.length} nodes. Continue?`)) return;
    setBulkProcessing(true);
    setBulkProgressMsg('EXECUTING WIPE...');
    try {
      await db.deleteOrder(selectedIds.join(','), tenantId);
      setSelectedIds([]);
      await loadData();
      if (onRefresh) onRefresh();
      alert(`Wipe Successful: Clusters purged.`);
    } catch (e: any) {
      alert(`Protocol Denied: ${e.message}`);
    } finally { 
      setBulkProcessing(false); 
      setBulkProgressMsg('');
    }
  };

  const handleBulkShip = async () => {
    if (!confirm(`Logistics Sync: Transmit selected leads to Courier? Note: Only CONFIRMED orders will be processed.`)) return;
    setBulkProcessing(true);
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let lastError = '';

    const targetIds = [...selectedIds];
    for (let i = 0; i < targetIds.length; i++) {
        const id = targetIds[i];
        const order = orders.find(o => o.id === id);
        
        if (order) {
            // STRICT FILTER: Only ship CONFIRMED orders. 
            // Skips ALREADY SHIPPED and PENDING/OPEN_LEAD.
            if (order.status !== OrderStatus.CONFIRMED) {
                console.warn(`Skipping ${order.id}: Status is ${order.status}, expected CONFIRMED.`);
                skipCount++;
                continue;
            }

            setBulkProgressMsg(`SHIPPING ${i+1}/${targetIds.length}: ${order.customerName}`);
            try {
                // SEQUENTIAL DISPATCH with robust error trapping
                await db.shipOrder(order, tenantId);
                successCount++;
            } catch (err: any) {
                failCount++;
                lastError = err.message;
                console.error(`FDE Handshake failed for ${order.id}:`, err);
            }
            // 800ms COOLDOWN: Crucial for legacy FDE PHP backend to stabilize between records
            await new Promise(r => setTimeout(r, 800));
        }
    }

    setBulkProcessing(false);
    setBulkProgressMsg('');
    
    let summary = `Logistics Summary:\n- Processed: ${successCount}\n- Failed: ${failCount}\n- Skipped (Not Confirmed/Already Shipped): ${skipCount}`;
    if (failCount > 0) summary += `\n\nLast Error: ${lastError}`;
    alert(summary);
    
    setSelectedIds([]);
    await loadData();
    if (onRefresh) onRefresh();
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === orders.length && orders.length > 0) setSelectedIds([]);
    else setSelectedIds(orders.map(o => o.id));
  };

  const getStatusColor = (status: OrderStatus) => {
    switch(status) {
      case OrderStatus.PENDING: return 'bg-blue-600 text-white';
      case OrderStatus.OPEN_LEAD: return 'bg-sky-500 text-white';
      case OrderStatus.CONFIRMED: return 'bg-emerald-500 text-white';
      case OrderStatus.REJECTED: return 'bg-rose-600 text-white';
      case OrderStatus.NO_ANSWER: return 'bg-amber-400 text-black';
      case OrderStatus.SHIPPED: return 'bg-indigo-600 text-white';
      case OrderStatus.HOLD: return 'bg-purple-600 text-white';
      default: return 'bg-slate-200 text-slate-600';
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="flex flex-col h-full bg-white animate-slide-in relative">
      {selectedIds.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-slate-950 text-white p-4 flex items-center justify-between shadow-2xl rounded-b-2xl border-b border-white/10">
          <div className="flex items-center gap-4 ml-4">
              {bulkProcessing ? <Loader2 className="animate-spin text-blue-400" size={20}/> : <CheckSquare className="text-blue-500" size={20}/>}
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest">{selectedIds.length} Nodes Locked</span>
                {bulkProgressMsg && <span className="text-[8px] font-bold text-blue-400 uppercase animate-pulse">{bulkProgressMsg}</span>}
              </div>
          </div>
          <div className="flex gap-2">
            {(status === 'ALL' || status === OrderStatus.CONFIRMED || status === OrderStatus.PENDING || status === OrderStatus.OPEN_LEAD) && (
              <button disabled={bulkProcessing} onClick={handleBulkShip} className="bg-blue-600 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all disabled:opacity-50">
                <Truck size={14} /> Bulk Ship
              </button>
            )}
            {onBulkAction && (
              <button disabled={bulkProcessing} onClick={() => { onBulkAction(selectedIds); setSelectedIds([]); }} className="bg-slate-800 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg hover:bg-black transition-all disabled:opacity-50">
                <Printer size={14} /> Label Print
              </button>
            )}
            <button disabled={bulkProcessing} onClick={handleBulkDelete} className="bg-rose-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-rose-700 transition-all disabled:opacity-50">
              <Trash2 size={14} /> Wipe Registry
            </button>
            <button disabled={bulkProcessing} onClick={() => setSelectedIds([])} className="bg-white/10 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase disabled:opacity-30">Cancel</button>
          </div>
        </div>
      )}

      <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/20">
        <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              placeholder="Registry Search..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="w-full bg-white border border-slate-200 pl-11 pr-4 py-3 rounded-2xl outline-none text-[13px] font-bold focus:ring-2 focus:ring-blue-500 shadow-sm" 
            />
        </div>
        <div className="flex items-center gap-4">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total: {totalCount.toLocaleString()} Nodes
            </div>
            <div className="flex items-center gap-1">
               <button disabled={currentPage === 1 || isLoading} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30"><ChevronLeft size={16}/></button>
               <span className="text-[11px] font-black text-slate-900 bg-white border border-slate-200 px-3 py-1 rounded-lg">Page {currentPage} of {totalPages || 1}</span>
               <button disabled={currentPage === totalPages || totalPages === 0 || isLoading} onClick={() => setCurrentPage(p => p + 1)} className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30"><ChevronRight size={16}/></button>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto no-scrollbar">
        <table className="w-full text-left compact-table">
          <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className="w-12 text-center" onClick={toggleSelectAll}>
                <div className={`cursor-pointer ${selectedIds.length === orders.length && orders.length > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                   {selectedIds.length === orders.length && orders.length > 0 ? <CheckSquare size={18}/> : <Square size={18}/>}
                </div>
              </th>
              <th>Reference</th>
              <th>Consignee</th>
              <th className="text-center">History Intel</th>
              <th>Total</th>
              <th className="text-center">Status</th>
              <th className="text-right pr-6">Action</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${isLoading ? 'opacity-50' : ''}`}>
            {orders.length === 0 && !isLoading && (
              <tr><td colSpan={7} className="py-20 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">No Records Found</td></tr>
            )}
            {orders.map((order) => {
              const last8 = order.customerPhone.slice(-8);
              const history = customerHistories[last8];
              const isSelected = selectedIds.includes(order.id);
              return (
                <tr key={order.id} className={`hover:bg-slate-50 transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/50' : ''}`} onClick={(e) => handleOrderClick(e, order.id)}>
                  <td onClick={(e) => { e.stopPropagation(); setSelectedIds(prev => prev.includes(order.id) ? prev.filter(x => x !== order.id) : [...prev, order.id]); }} className="text-center">
                    <div className={`p-1 transition-all ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>
                      {isSelected ? <CheckSquare size={18}/> : <Square size={18}/>}
                    </div>
                  </td>
                  <td><span className="font-mono text-[10px] font-bold text-slate-400">#{order.id.slice(-8)}</span></td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-black uppercase text-slate-900">{order.customerName}</span>
                      <span className="text-[10px] font-bold text-slate-400">{order.customerPhone}</span>
                    </div>
                  </td>
                  <td className="text-center">
                      <div className="flex flex-col gap-1 items-center">
                        {history?.returns > 0 ? (
                          <div className="bg-rose-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">RISK ({history.returns})</div>
                        ) : history?.count >= 2 ? (
                          <div className="bg-blue-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">REPEAT ({history.count})</div>
                        ) : <span className="text-[10px] font-bold text-slate-300">-</span>}
                      </div>
                  </td>
                  <td><span className="text-sm font-black text-slate-900">{formatCurrency(order.totalAmount)}</span></td>
                  <td className="text-center">
                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>{order.status.replace('_', ' ')}</span>
                  </td>
                  <td className="text-right pr-6">
                    <div className="flex items-center justify-end gap-2">
                        <ExternalLink size={14} className="text-slate-300 group-hover:text-blue-600 transition-all" />
                        <button className="p-2.5 rounded-xl bg-slate-50 text-slate-400 group-hover:text-blue-600 transition-all"><ChevronRight size={16}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing {orders.length} of {totalCount.toLocaleString()} results</div>
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1 || isLoading} onClick={() => setCurrentPage(1)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase hover:bg-slate-200 disabled:opacity-30">First</button>
            <button disabled={currentPage === totalPages || totalPages === 0 || isLoading} onClick={() => setCurrentPage(totalPages)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase hover:bg-slate-200 disabled:opacity-30">Last</button>
          </div>
      </div>
    </div>
  );
};
