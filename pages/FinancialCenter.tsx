
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus, Product } from '../types';
import { formatCurrency } from '../utils/helpers';
import { 
  Wallet, 
  Calculator, 
  ArrowUpRight, 
  TrendingUp, 
  Info, 
  DollarSign, 
  Package, 
  Percent, 
  Calendar, 
  Users, 
  PieChart, 
  Download, 
  Settings2,
  Receipt,
  Megaphone,
  Printer
} from 'lucide-react';

interface FinancialCenterProps {
  tenantId: string;
  shopName: string;
}

export const FinancialCenter: React.FC<FinancialCenterProps> = ({ tenantId, shopName }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); 
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [deliveryFee, setDeliveryFee] = useState(350);
  const [returnFee, setReturnFee] = useState(150);
  const [manualExpenses, setManualExpenses] = useState(0);
  const [advertisingCosts, setAdvertisingCosts] = useState(0);
  const [workerCount, setWorkerCount] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [o, p] = await Promise.all([db.getOrders(tenantId), db.getProducts(tenantId)]);
      setOrders(o);
      setProducts(p);
      setLoading(false);
    };
    load();
  }, [tenantId]);

  const financialData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59);

    const filtered = orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= start && d <= end;
    });

    const deliveredOrders = filtered.filter(o => o.status === OrderStatus.DELIVERED);
    const returnedOrders = filtered.filter(o => 
      o.status === OrderStatus.RETURNED || 
      o.status === OrderStatus.RETURN_COMPLETED
    );

    const grossRevenue = deliveredOrders.reduce((s, o) => s + o.totalAmount, 0);
    
    const totalCogs = deliveredOrders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => {
        const prod = products.find(p => p.id === item.productId);
        // Fix: Property 'buyingPrice' does not exist on type 'Product'. 
        // Calculating average cost from batches as a fallback for COGS estimation.
        const avgBuyingPrice = prod?.batches && prod.batches.length > 0 
          ? prod.batches.reduce((acc, b) => acc + b.buyingPrice, 0) / prod.batches.length 
          : 0;
        return itemSum + (item.quantity * avgBuyingPrice);
      }, 0);
    }, 0);

    const deliveredCount = deliveredOrders.length;
    const returnedCount = returnedOrders.length;
    
    const totalDeliveryDeduction = deliveredCount * deliveryFee;
    const totalReturnDeduction = returnedCount * returnFee;
    
    const grossProfit = grossRevenue - totalCogs;
    const netProfit = grossProfit - totalDeliveryDeduction - totalReturnDeduction - manualExpenses - advertisingCosts;
    
    const investorShare = Math.max(0, netProfit * 0.5);
    const workerSharePool = Math.max(0, netProfit * 0.5);
    const perWorkerProfit = workerCount > 0 ? workerSharePool / workerCount : 0;

    return {
      grossRevenue,
      totalCogs,
      grossProfit,
      deliveredCount,
      returnedCount,
      totalDeliveryDeduction,
      totalReturnDeduction,
      netProfit,
      investorShare,
      workerSharePool,
      perWorkerProfit,
      orderCount: filtered.length
    };
  }, [orders, products, startDate, endDate, deliveryFee, returnFee, manualExpenses, advertisingCosts, workerCount]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="p-20 text-center font-black uppercase text-slate-300 tracking-[0.5em]">Syncing Ledgers...</div>;

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-20 animate-slide-in print:p-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 print:hidden">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName} P&L</h2>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Financial Oracle Terminal</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <Calendar size={14} className="text-blue-600" />
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                className="text-[11px] font-bold text-slate-900 outline-none uppercase bg-transparent"
              />
              <span className="text-slate-300 text-[10px] font-black">TO</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                className="text-[11px] font-bold text-slate-900 outline-none uppercase bg-transparent"
              />
            </div>
          </div>
          <button 
            onClick={handlePrint}
            className="bg-black text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl"
          >
            <Download size={14} /> Download P&L Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-4 space-y-6 print:hidden">
          <div className="modern-card p-6 bg-slate-900 text-white border-none shadow-2xl">
            <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 flex items-center gap-2 text-indigo-400">
              <Settings2 size={16} /> Operational Rates
            </h3>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Delivery Fee / Parcel (LKR)</label>
                <input 
                  type="number" 
                  value={deliveryFee} 
                  onChange={e => setDeliveryFee(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-black text-xl text-white outline-none focus:border-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Return Fee / Parcel (LKR)</label>
                <input 
                  type="number" 
                  value={returnFee} 
                  onChange={e => setReturnFee(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-black text-xl text-white outline-none focus:border-rose-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Staff Workforce Count</label>
                <div className="flex items-center gap-3">
                    <Users size={18} className="text-slate-500" />
                    <input 
                        type="number" 
                        value={workerCount} 
                        onChange={e => setWorkerCount(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-black text-xl text-white outline-none focus:border-blue-500 transition-all"
                    />
                </div>
              </div>
            </div>
          </div>

          <div className="modern-card p-6 space-y-6">
            <h3 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
              <Receipt size={16} /> Variable Overheads
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">General Expenses</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">LKR</span>
                  <input 
                    type="number" 
                    value={manualExpenses} 
                    onChange={e => setManualExpenses(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-black text-lg outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Advertising Budget</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">LKR</span>
                  <input 
                    type="number" 
                    value={advertisingCosts} 
                    onChange={e => setAdvertisingCosts(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-black text-lg outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
            <div className="modern-card p-8 bg-emerald-50 border-emerald-100 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Gross Revenue</p>
                <h3 className="text-4xl font-black text-emerald-950 tracking-tighter">{formatCurrency(financialData.grossRevenue)}</h3>
              </div>
              <div className="mt-4 flex items-center gap-2 text-emerald-600 text-[10px] font-black uppercase">
                <Package size={14} /> {financialData.deliveredCount} Orders Settled
              </div>
            </div>
            
            <div className="modern-card p-8 bg-blue-600 text-white border-none shadow-xl shadow-blue-200 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-1">Net Profit Pool</p>
                <h3 className="text-4xl font-black tracking-tighter">{formatCurrency(financialData.netProfit)}</h3>
              </div>
              <div className="mt-4 flex items-center gap-2 text-blue-200 text-[10px] font-black uppercase">
                <TrendingUp size={14} /> 
                {financialData.grossRevenue > 0 ? ((financialData.netProfit / financialData.grossRevenue) * 100).toFixed(1) : 0}% Net Margin
              </div>
            </div>
          </div>

          <div className="modern-card overflow-hidden bg-white shadow-sm border border-slate-100">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <PieChart size={16} className="text-indigo-600" /> Statement of Profit & Loss
              </h3>
              <div className="text-[10px] font-black text-slate-400 uppercase">{startDate} TO {endDate}</div>
            </div>
            
            <div className="p-6 space-y-3">
              <div className="flex justify-between items-center py-2">
                <span className="text-xs font-bold text-slate-600">Total Sales Revenue</span>
                <span className="text-sm font-black text-slate-900">{formatCurrency(financialData.grossRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-2 text-rose-600 bg-rose-50 px-3 rounded-lg">
                <span className="text-xs font-bold uppercase tracking-tight">Cost of Goods Sold (COGS)</span>
                <span className="text-sm font-black">({formatCurrency(financialData.totalCogs)})</span>
              </div>
              <div className="flex justify-between items-center py-3 border-y border-slate-50 font-black">
                <span className="text-xs uppercase">Gross Profit</span>
                <span className="text-sm">{formatCurrency(financialData.grossProfit)}</span>
              </div>

              <div className="space-y-1 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Operating Deductions</p>
                <div className="flex justify-between items-center py-1 text-slate-500">
                  <span className="text-xs font-medium">Delivery Fees ({financialData.deliveredCount} × {deliveryFee})</span>
                  <span className="text-xs font-bold text-rose-600">-{formatCurrency(financialData.totalDeliveryDeduction)}</span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-500">
                  <span className="text-xs font-medium">Return Fees ({financialData.returnedCount} × {returnFee})</span>
                  <span className="text-xs font-bold text-rose-600">-{formatCurrency(financialData.totalReturnDeduction)}</span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-500">
                  <span className="text-xs font-medium">General Expenses</span>
                  <span className="text-xs font-bold text-rose-600">-{formatCurrency(manualExpenses)}</span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-500">
                  <span className="text-xs font-medium">Advertising Costs</span>
                  <span className="text-xs font-bold text-rose-600">-{formatCurrency(advertisingCosts)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-4 mt-4 border-t-2 border-slate-900 bg-slate-900 text-white px-5 rounded-[2rem] shadow-xl">
                <span className="text-sm font-black uppercase tracking-widest">Net Profit</span>
                <span className="text-2xl font-black">{formatCurrency(financialData.netProfit)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="modern-card p-6 border-l-4 border-l-indigo-600 bg-white">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><PieChart size={16}/></div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Investor Share (50%)</h4>
                </div>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(financialData.investorShare)}</p>
                <div className="mt-2 text-[9px] font-bold text-slate-400 uppercase">Capital Recovery Share</div>
            </div>
            
            <div className="modern-card p-6 border-l-4 border-l-blue-600 bg-white">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={16}/></div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Worker Share (50%)</h4>
                </div>
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-2xl font-black text-slate-900">{formatCurrency(financialData.workerSharePool)}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Pool for {workerCount} Staff</p>
                    </div>
                    <div className="text-right">
                        <p className="text-lg font-black text-blue-600 leading-none">{formatCurrency(financialData.perWorkerProfit)}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Per Worker</p>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden print:block fixed inset-0 bg-white p-12 z-[9999]">
        <div className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-8">
            <div>
                <h1 className="text-4xl font-black uppercase tracking-tighter">{shopName}</h1>
                <p className="text-xs font-bold uppercase text-slate-500 tracking-widest">Certified Financial Statement</p>
            </div>
            <div className="text-right">
                <p className="text-xs font-black uppercase">Report Period</p>
                <p className="text-xl font-bold">{startDate} to {endDate}</p>
            </div>
        </div>

        <div className="space-y-8">
            <div className="grid grid-cols-2 gap-8">
                <div className="p-6 border-2 border-slate-100 rounded-3xl">
                    <p className="text-xs font-black uppercase text-slate-400 mb-1">Gross Revenue</p>
                    <p className="text-3xl font-black">{formatCurrency(financialData.grossRevenue)}</p>
                </div>
                <div className="p-6 bg-slate-900 text-white rounded-3xl">
                    <p className="text-xs font-black uppercase text-slate-500 mb-1">Net Profit</p>
                    <p className="text-3xl font-black">{formatCurrency(financialData.netProfit)}</p>
                </div>
            </div>

            <table className="w-full text-left">
                <thead>
                    <tr className="border-b-2 border-slate-200">
                        <th className="py-4 text-xs font-black uppercase">Ledger Item</th>
                        <th className="py-4 text-right text-xs font-black uppercase">Valuation</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    <tr><td className="py-4 font-bold">Total Sales (Delivered)</td><td className="py-4 text-right font-black">{formatCurrency(financialData.grossRevenue)}</td></tr>
                    <tr><td className="py-4 font-bold">Cost of Goods Sold (COGS)</td><td className="py-4 text-right font-black text-rose-600">({formatCurrency(financialData.totalCogs)})</td></tr>
                    <tr className="bg-slate-50"><td className="py-4 font-black uppercase">Gross Profit</td><td className="py-4 text-right font-black">{formatCurrency(financialData.grossProfit)}</td></tr>
                    <tr><td className="py-4 font-bold">Delivery Fees ({financialData.deliveredCount} parcels)</td><td className="py-4 text-right font-black text-rose-600">-{formatCurrency(financialData.totalDeliveryDeduction)}</td></tr>
                    <tr><td className="py-4 font-bold">Return Fees ({financialData.returnedCount} parcels)</td><td className="py-4 text-right font-black text-rose-600">-{formatCurrency(financialData.totalReturnDeduction)}</td></tr>
                    <tr><td className="py-4 font-bold">General Expenses</td><td className="py-4 text-right font-black text-rose-600">-{formatCurrency(manualExpenses)}</td></tr>
                    <tr><td className="py-4 font-bold">Advertising Costs</td><td className="py-4 text-right font-black text-rose-600">-{formatCurrency(advertisingCosts)}</td></tr>
                    <tr className="border-t-2 border-slate-900 bg-slate-50"><td className="py-6 font-black uppercase text-lg">Net Profit Distribution</td><td className="py-6 text-right font-black text-2xl">{formatCurrency(financialData.netProfit)}</td></tr>
                </tbody>
            </table>

            <div className="grid grid-cols-2 gap-8 mt-12 border-t-2 border-slate-100 pt-8">
                <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 mb-4">Investor Recovery Pool (50%)</h4>
                    <p className="text-2xl font-black">{formatCurrency(financialData.investorShare)}</p>
                </div>
                <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 mb-4">Worker Reward Pool (50%)</h4>
                    <p className="text-2xl font-black">{formatCurrency(financialData.workerSharePool)}</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase">{workerCount} active staff | {formatCurrency(financialData.perWorkerProfit)} per person</p>
                </div>
            </div>
        </div>

        <div className="mt-20 flex justify-between items-end border-t border-slate-100 pt-10">
            <div className="space-y-4">
                <div className="w-48 h-px bg-slate-300"></div>
                <p className="text-[10px] font-black uppercase">Finance Manager Signature</p>
            </div>
            <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{shopName} Internal Auditor | Generated {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};
