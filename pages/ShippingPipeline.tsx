
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../services/mockBackend';
import { OrderList } from './OrderList';
import { OrderStatus } from '../types';
import { Truck, MapPin, RotateCw, Archive, CheckCircle, Calendar, ListFilter, ArrowRightLeft, RefreshCw } from 'lucide-react';
import { BillPrintView } from '../components/BillPrintView';

interface ShippingPipelineProps {
  tenantId: string;
  shopName: string;
  onSelectOrder: (id: string) => void;
}

export const ShippingPipeline: React.FC<ShippingPipelineProps> = ({ tenantId, shopName, onSelectOrder }) => {
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'LOGISTICS_ALL' | 'TODAY_SHIPPED'>('LOGISTICS_ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  const filters = [
    { label: 'ALL LOGISTICS', status: 'LOGISTICS_ALL', icon: <ListFilter size={14} /> },
    { label: 'TODAY DISPATCHED', status: 'TODAY_SHIPPED', icon: <Calendar size={14} /> },
    { label: 'SHIPPED', status: OrderStatus.SHIPPED, icon: <Truck size={14} /> },
    { label: 'TRANSFER', status: OrderStatus.TRANSFER, icon: <ArrowRightLeft size={14} /> }, 
    { label: 'DELIVERY', status: OrderStatus.DELIVERY, icon: <MapPin size={14} /> },
    { label: 'DELIVERED', status: OrderStatus.DELIVERED, icon: <CheckCircle size={14} /> },
    { label: 'RESIDUAL', status: OrderStatus.RESIDUAL, icon: <RotateCw size={14} /> },
    { label: 'RETURNED', status: OrderStatus.RETURNED, icon: <Archive size={14} /> },
    { label: 'RETURN COMPLETED', status: OrderStatus.RETURN_COMPLETED, icon: <CheckCircle size={14} /> },
  ];

  const handleBulkPrint = async (ids: string[]) => {
    const tenant = await db.getTenant(tenantId);
    if (!tenant) return;
    
    const printContainer = document.createElement('div');
    printContainer.className = 'print-only';
    document.body.appendChild(printContainer);
    const root = createRoot(printContainer);
    
    const ordersToPrint = await Promise.all(ids.map(id => db.getOrder(id, tenantId)));
    
    root.render(
      <div className="space-y-10">
        {ordersToPrint.map(o => o ? <BillPrintView key={o.id} order={o} settings={tenant.settings} /> : null)}
      </div>
    );
    
    setTimeout(() => {
        window.print();
        root.unmount();
        document.body.removeChild(printContainer);
    }, 800);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-black text-white rounded-2xl shadow-xl rotate-3">
                    <Truck size={24} />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-black tracking-tighter uppercase leading-none">{shopName} Logistics</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Shipment Tracking & Status Control</p>
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
          {filters.map((f) => (
            <button
              key={f.status}
              onClick={() => setActiveFilter(f.status as any)}
              className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeFilter === f.status 
                ? 'bg-black text-white shadow-lg scale-[1.05]' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-black'
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm min-h-[600px] overflow-hidden">
        <OrderList 
          key={refreshKey}
          tenantId={tenantId} 
          onSelectOrder={onSelectOrder} 
          status={activeFilter as any}
          logisticsOnly={true} 
          onBulkAction={handleBulkPrint}
        />
      </div>
    </div>
  );
};
