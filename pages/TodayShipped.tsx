
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../services/mockBackend';
import { Order, TenantSettings } from '../types';
import { formatCurrency, getSLDateString } from '../utils/helpers';
import { Printer, CalendarCheck, Search, Download, Calendar, Package, RefreshCw } from 'lucide-react';
import { LabelPrintView } from '../components/LabelPrintView';

interface TodayShippedProps {
  tenantId: string;
  shopName: string;
}

export const TodayShipped: React.FC<TodayShippedProps> = ({ tenantId, shopName }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [targetDate, setTargetDate] = useState(getSLDateString());

  const load = useCallback(async () => {
    setLoading(true);
    try {
        const [fetchedOrders, fetchedTenant] = await Promise.all([
            db.getOrders({ 
                tenantId, 
                status: 'TODAY_SHIPPED', 
                startDate: targetDate, 
                limit: 1000 
            }),
            db.getTenant(tenantId)
        ]);
        if (fetchedTenant) setTenantSettings(fetchedTenant.settings);
        setOrders(fetchedOrders.data || []);
    } catch (e) {
        console.error("Daily Logs Handshake Failure", e);
    } finally {
        setLoading(false);
    }
  }, [tenantId, targetDate]);

  useEffect(() => { load(); }, [load]);

  const dailyOrders = useMemo(() => {
      if (!Array.isArray(orders)) return [];
      return orders.filter(o => {
          const matchesSearch = o.customerName.toLowerCase().includes(search.toLowerCase()) || 
                                o.id.includes(search) || 
                                o.trackingNumber?.includes(search);
          return matchesSearch;
      });
  }, [orders, search]);

  const handlePrintAll = () => {
    if (!dailyOrders.length || !tenantSettings) return;
    const printContainer = document.createElement('div');
    printContainer.className = 'print-only';
    document.body.appendChild(printContainer);
    const root = createRoot(printContainer);
    root.render(<LabelPrintView orders={dailyOrders} settings={tenantSettings} />);
    setTimeout(() => { window.print(); root.unmount(); document.body.removeChild(printContainer); }, 500);
  };

  const handlePrintSingle = (order: Order) => {
    if (!tenantSettings) return;
    const printContainer = document.createElement('div');
    printContainer.className = 'print-only';
    document.body.appendChild(printContainer);
    const root = createRoot(printContainer);
    root.render(<LabelPrintView orders={[order]} settings={tenantSettings} />);
    setTimeout(() => { window.print(); root.unmount(); document.body.removeChild(printContainer); }, 500);
  };

  return (
    <div className="space-y-6 animate-slide-in max-w-[1400px] mx-auto pb-10 px-2">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-rose-500 text-white rounded-[1.5rem] shadow-xl rotate-2">
            <CalendarCheck size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{shopName} Dispatch</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Operational Log Registry</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                 <Calendar size={16} className="text-rose-500" />
                 <input 
                    type="date" 
                    value={targetDate} 
                    onChange={e => setTargetDate(e.target.value)} 
                    className="text-xs font-black text-slate-900 outline-none uppercase bg-transparent" 
                />
            </div>
            <button 
                onClick={load} 
                className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 transition-all shadow-sm"
            >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={handlePrintAll} className="px-8 py-3.5 bg-slate-950 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl flex items-center gap-3">
                <Printer size={18} /> Print Daily Manifest
            </button>
        </div>
      </div>

      <div className="modern-card overflow-hidden flex flex-col min-h-[600px] bg-white border border-slate-100 shadow-sm rounded-[3rem]">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
            <div className="relative w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    placeholder="Search logs..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-[13px] font-bold focus:ring-2 focus:ring-rose-500 outline-none shadow-sm" 
                />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl uppercase tracking-widest">
                    {dailyOrders.length} DISPATCHES DETECTED
                </span>
            </div>
        </div>

        <div className="flex-1 overflow-x-auto no-scrollbar">
            <table className="w-full text-left compact-table">
                <thead>
                    <tr className="bg-slate-50/50">
                        <th className="pl-8">Node Reference</th>
                        <th>Consignee</th>
                        <th>Manifest Detail</th>
                        <th className="text-center">Status</th>
                        <th>Settlement (COD)</th>
                        <th className="text-right pr-8">Terminal</th>
                    </tr>
                </thead>
                <tbody className={`divide-y divide-slate-50 ${loading ? 'opacity-30' : ''}`}>
                    {dailyOrders.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="py-32 text-center">
                                <div className="flex flex-col items-center opacity-20">
                                    <Package size={64} className="mb-4 stroke-1" />
                                    <p className="text-sm font-black uppercase tracking-[0.5em]">Log Registry Empty</p>
                                </div>
                            </td>
                        </tr>
                    ) : dailyOrders.map(o => (
                        <tr key={o.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="pl-8 py-6 font-mono text-[10px] font-black text-slate-400 uppercase tracking-tighter">#{o.id.slice(-8)}</td>
                            <td className="py-6">
                                <div className="flex flex-col">
                                    <span className="font-black text-slate-900 text-[14px] uppercase tracking-tight">{o.customerName}</span>
                                    <span className="text-[10px] font-bold text-slate-400 mt-0.5">{o.customerPhone}</span>
                                </div>
                            </td>
                            <td className="py-6">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black text-slate-600 truncate max-w-[220px] uppercase">{o.items[0]?.name}</span>
                                    <span className="text-[9px] font-mono font-bold text-blue-500 uppercase mt-0.5">{o.trackingNumber || 'Awaiting Logistics...'}</span>
                                </div>
                            </td>
                            <td className="text-center py-6">
                                <span className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10">
                                    {o.status}
                                </span>
                            </td>
                            <td className="py-6">
                                <span className="font-black text-slate-900 text-[14px]">{formatCurrency(o.totalAmount)}</span>
                            </td>
                            <td className="text-right pr-8 py-6">
                                <div className="flex items-center justify-end gap-2">
                                    <button 
                                        onClick={() => handlePrintSingle(o)} 
                                        className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 rounded-xl transition-all shadow-sm"
                                    >
                                        <Printer size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};
