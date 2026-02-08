
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus } from '../types';
import { OrderList } from './OrderList';
import { PhoneForwarded, ListFilter, Pause, RefreshCcw, RefreshCw } from 'lucide-react';

interface ResidualManagementProps {
  tenantId: string;
  shopName: string;
  onSelectOrder: (id: string) => void;
}

export const ResidualManagement: React.FC<ResidualManagementProps> = ({ tenantId, shopName, onSelectOrder }) => {
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    db.getOrders({ tenantId, limit: 10000 }).then(res => setOrders(res.data || []));
  }, [tenantId, refreshKey]);

  const counts = useMemo(() => {
    const stats = {
      ALL: 0,
      RESIDUAL: 0,
      REARRANGE: 0
    };
    if (Array.isArray(orders)) {
      orders.forEach(o => {
        const s = o.status as keyof typeof stats;
        if (stats[s] !== undefined) {
          stats[s]++;
          stats.ALL++;
        }
      });
    }
    return stats;
  }, [orders]);

  const filters = [
    { label: 'ALL AGED LEADS', status: 'ALL', icon: <ListFilter size={14}/>, count: counts.ALL },
    { label: 'RESIDUAL', status: OrderStatus.RESIDUAL, icon: <Pause size={14}/>, count: counts.RESIDUAL },
    { label: 'REARRANGE', status: OrderStatus.REARRANGE, icon: <RefreshCcw size={14}/>, count: counts.REARRANGE },
  ];

  return (
    <div className="space-y-8 animate-slide-in max-w-[1400px] mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-slate-900 text-white rounded-[2rem] shadow-xl rotate-3">
            <PhoneForwarded size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName} Residuals</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Recovery Terminal for Aging Leads</p>
          </div>
        </div>
        <button 
            onClick={() => setRefreshKey(prev => prev + 1)} 
            className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-95"
        >
            <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 bg-white p-2.5 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
        {filters.map(f => (
          <button
            key={f.status}
            onClick={() => setActiveFilter(f.status as any)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeFilter === f.status ? 'bg-slate-900 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-50 hover:text-black'}`}
          >
            {f.icon} {f.label}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[9px] ${activeFilter === f.status ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {f.count}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm min-h-[600px] overflow-hidden">
        <OrderList 
          key={refreshKey}
          tenantId={tenantId} 
          onSelectOrder={onSelectOrder} 
          status={activeFilter as any}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      </div>
    </div>
  );
};
