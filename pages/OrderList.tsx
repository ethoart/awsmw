import React, { useState, useEffect, useCallback } from 'react';
import { Order, OrderStatus } from '../types';
import { db } from '../services/mockBackend';
import { formatCurrency, getSLDateString } from '../utils/helpers';
import { Printer, Edit, Trash2, CheckSquare, Square, Package, AlertTriangle, ArrowRight } from 'lucide-react';

interface OrderListProps {
  tenantId: string;
  onSelectOrder: (id: string) => void;
  status?: OrderStatus | string;
  productId?: string | null;
  startDate?: string;
  endDate?: string;
  data?: Order[];
  logisticsOnly?: boolean;
  onBulkAction?: (ids: string[]) => void;
  onRefresh?: () => void;
}

interface CustomerHistoryStats {
    count: number;
    returns: number;
    waybills: number;
}

const CustomerHistoryBadge: React.FC<{ phone: string; tenantId: string }> = ({ phone, tenantId }) => {
    const [history, setHistory] = useState<CustomerHistoryStats | null>(null);

    useEffect(() => {
        let isMounted = true;
        if (phone) {
            db.getCustomerHistory(phone, tenantId).then(h => {
                if (isMounted) setHistory(h);
            });
        }
        return () => { isMounted = false; };
    }, [phone, tenantId]);

    return (
        <div className="flex flex-col gap-1 items-center">
            {history && history.returns > 0 ? (
                <div className="bg-rose-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase shadow-sm">RISK ({history.returns})</div>
            ) : history && history.count >= 2 ? (
                <div className="bg-blue-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase shadow-sm">REPEAT ({history.count})</div>
            ) : null}
            
            {history && history.waybills > 0 && (
                <div className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase shadow-sm">
                    WB: {history.waybills}
                </div>
            )}

            {(!history || (!history.returns && history.count < 2 && !history.waybills)) && (
                <span className="text-[10px] font-bold text-slate-300">-</span>
            )}
        </div>
    );
};

export const OrderList: React.FC<OrderListProps> = ({ 
    tenantId, 
    onSelectOrder, 
    status, 
    productId, 
    startDate, 
    endDate, 
    data, 
    logisticsOnly,
    onBulkAction,
    onRefresh 
}) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const fetchOrders = useCallback(async () => {
        if (data) {
            setOrders(data);
            return;
        }
        setLoading(true);
        try {
            const params: any = { tenantId, limit: 1000 };
            if (status && status !== 'ALL') params.status = status;
            if (productId) params.productId = productId;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            
            const res = await db.getOrders(params);
            setOrders(res.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [tenantId, status, productId, startDate, endDate, data]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const toggleSelectAll = () => {
        if (selectedIds.length === orders.length && orders.length > 0) setSelectedIds([]);
        else setSelectedIds(orders.map(o => o.id));
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this order?")) return;
        await db.deleteOrder(id, tenantId);
        if (onRefresh) onRefresh();
        else fetchOrders();
    };

    return (
        <div className="flex flex-col h-full">
            {onBulkAction && selectedIds.length > 0 && (
                <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between animate-slide-in">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{selectedIds.length} Selected</span>
                    <button onClick={() => onBulkAction(selectedIds)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-blue-700 transition-all">
                        <Printer size={14} /> Bulk Action
                    </button>
                </div>
            )}
            
            <div className="flex-1 overflow-x-auto no-scrollbar">
                <table className="w-full text-left compact-table">
                    <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                            <th className="w-12 text-center pl-6" onClick={toggleSelectAll}>
                                <div className={`cursor-pointer ${selectedIds.length === orders.length && orders.length > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                    {selectedIds.length === orders.length && orders.length > 0 ? <CheckSquare size={18}/> : <Square size={18}/>}
                                </div>
                            </th>
                            <th className="pl-4">Reference</th>
                            <th>Customer Identity</th>
                            <th className="text-center">History</th>
                            <th>Order Details</th>
                            <th>Status</th>
                            <th>Value</th>
                            <th className="text-right pr-8">Actions</th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y divide-slate-50 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-32 text-center">
                                    <div className="flex flex-col items-center opacity-20">
                                        <Package size={64} className="mb-4 stroke-1" />
                                        <p className="text-sm font-black uppercase tracking-[0.5em]">No Orders Found</p>
                                    </div>
                                </td>
                            </tr>
                        ) : orders.map(o => (
                            <tr key={o.id} onClick={() => onSelectOrder(o.id)} className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selectedIds.includes(o.id) ? 'bg-blue-50/30' : ''}`}>
                                <td className="pl-6 py-4 text-center" onClick={(e) => { e.stopPropagation(); toggleSelection(o.id); }}>
                                    <div className={`transition-all ${selectedIds.includes(o.id) ? 'text-blue-600' : 'text-slate-200 group-hover:text-slate-300'}`}>
                                        {selectedIds.includes(o.id) ? <CheckSquare size={18}/> : <Square size={18}/>}
                                    </div>
                                </td>
                                <td className="pl-4 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-mono text-[10px] font-black text-slate-400 uppercase tracking-tighter">#{o.id.slice(-6)}</span>
                                        <span className="text-[8px] font-bold text-slate-300 uppercase mt-0.5">{new Date(o.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <div className="flex flex-col">
                                        <span className="font-black text-slate-900 text-[13px] uppercase tracking-tight">{o.customerName}</span>
                                        <span className="text-[10px] font-bold text-slate-400 mt-0.5">{o.customerPhone}</span>
                                        {o.customerCity && <span className="text-[9px] font-black text-blue-500 uppercase mt-1 flex items-center gap-1"><ArrowRight size={8}/> {o.customerCity}</span>}
                                    </div>
                                </td>
                                <td className="text-center py-4">
                                    <CustomerHistoryBadge phone={o.customerPhone} tenantId={tenantId} />
                                </td>
                                <td className="py-4">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-slate-600 truncate max-w-[200px] uppercase">{o.items[0]?.name}</span>
                                        {o.items.length > 1 && <span className="text-[9px] font-bold text-slate-400 uppercase">+ {o.items.length - 1} More Items</span>}
                                        {o.trackingNumber && <span className="text-[9px] font-mono font-bold text-indigo-500 uppercase mt-1">WB: {o.trackingNumber}</span>}
                                    </div>
                                </td>
                                <td className="py-4">
                                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                        o.status === OrderStatus.CONFIRMED ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                        o.status === OrderStatus.REJECTED ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                        o.status === OrderStatus.SHIPPED ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                        'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}>
                                        {o.status.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="py-4">
                                    <span className="font-black text-slate-900 text-[13px]">{formatCurrency(o.totalAmount)}</span>
                                </td>
                                <td className="text-right pr-8 py-4">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit size={14}/></button>
                                        <button onClick={(e) => handleDelete(e, o.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};