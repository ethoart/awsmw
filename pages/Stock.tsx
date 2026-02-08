
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../services/mockBackend';
import { Product, StockBatch, Order, OrderStatus } from '../types';
import { 
  Plus, 
  Trash2, 
  Save, 
  Package, 
  Layers, 
  TrendingDown, 
  DollarSign, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Info,
  ArrowRight,
  History,
  Edit3,
  Check,
  TrendingUp,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { formatCurrency } from '../utils/helpers';

interface StockProps {
  tenantId: string;
  shopName: string;
}

type StockHistoryItem = {
    id: string;
    date: string;
    type: 'IN' | 'OUT' | 'RESTOCK';
    productName: string;
    sku: string;
    quantity: number;
    reference: string;
    user?: string;
};

export const Stock: React.FC<StockProps> = ({ tenantId, shopName }) => {
  const [view, setView] = useState<'LIVE' | 'HISTORY'>('LIVE');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const [newProd, setNewProd] = useState({ name: '', sku: '', price: 0 });
  const [batchForms, setBatchForms] = useState<{[key: string]: { quantity: number, buyingPrice: number }}>({});
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const prodData = await db.getProducts(tenantId);
      setProducts(prodData);
      
      if (view === 'HISTORY') {
          // Fetch recent orders for history derivation
          const orderData = await db.getOrders({ tenantId, limit: 2000 });
          setOrders(orderData.data || []);
      }
    } catch (e) {
      console.error("Failed to load inventory data", e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, view]);

  useEffect(() => { load(); }, [load]);

  const historyData = useMemo(() => {
      if (view !== 'HISTORY') return [];
      const history: StockHistoryItem[] = [];

      // 1. Stock IN (Batches)
      products.forEach(p => {
          (p.batches || []).forEach(b => {
              history.push({
                  id: b.id,
                  date: b.createdAt,
                  type: b.isReturn ? 'RESTOCK' : 'IN',
                  productName: p.name,
                  sku: p.sku,
                  quantity: b.quantity, // Note: This is current qty, ideally we'd track original qty but for now this is best approximation or we rely on log
                  reference: b.isReturn ? 'Return Restock' : 'New Batch',
              });
          });
      });

      // 2. Stock OUT (Orders)
      // Only include orders that deduct stock (Confirmed, Shipped, Delivered)
      const deductStatuses = [OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.TRANSFER, OrderStatus.RETURNED]; 
      
      orders.forEach(o => {
          if (deductStatuses.includes(o.status)) {
              o.items.forEach(item => {
                  const pRef = products.find(p => p.id === item.productId);
                  history.push({
                      id: `${o.id}-${item.productId}`,
                      date: o.confirmedAt || o.createdAt, // Use confirmation time as deduction time, fallback to creation
                      type: 'OUT',
                      productName: item.name,
                      sku: pRef?.sku || 'UNKNOWN',
                      quantity: item.quantity,
                      reference: `Order #${o.id.slice(-6)}`,
                      user: o.logs?.find(l => l.message.includes('CONFIRMED'))?.user || 'System'
                  });
              });
          }
      });

      return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [products, orders, view]);

  const handleAddProduct = async () => {
    if (!newProd.name || !newProd.sku) return alert("System Error: SKU and Identity Name required.");
    const p: Product = {
      id: `p-${Date.now()}`,
      tenantId,
      name: newProd.name,
      sku: newProd.sku,
      price: newProd.price,
      batches: []
    };
    await db.updateProduct(p);
    setNewProd({ name: '', sku: '', price: 0 });
    load();
  };

  const handleAddBatch = async (productId: string) => {
    const form = batchForms[productId];
    if (!form || form.quantity <= 0) return alert("Quantity must be greater than zero.");
    
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const newBatch: StockBatch = {
      id: `b-${Date.now()}`,
      quantity: form.quantity,
      buyingPrice: form.buyingPrice,
      createdAt: new Date().toISOString()
    };

    const updatedProduct: Product = {
      ...product,
      batches: [...(product.batches || []), newBatch]
    };

    await db.updateProduct(updatedProduct);
    setBatchForms(prev => ({ ...prev, [productId]: { quantity: 0, buyingPrice: 0 } }));
    load();
  };

  const handleUpdateBatchPrice = async (productId: string, batchId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const updatedBatches = product.batches.map(b => 
        b.id === batchId ? { ...b, buyingPrice: tempPrice } : b
    );

    await db.updateProduct({ ...product, batches: updatedBatches });
    setEditingBatchId(null);
    load();
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("CRITICAL PROTOCOL: Destroy this master product and all associated batches permanently?")) return;
    setLoading(true);
    try {
      await db.deleteProduct(id, tenantId);
      await load();
      alert("Product successfully purged from registry.");
    } catch (e: any) {
      alert("Registry access failure: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductStock = (p: Product) => (p.batches || []).reduce((sum, b) => sum + b.quantity, 0);
  const getProductCostValue = (p: Product) => (p.batches || []).reduce((sum, b) => sum + (b.quantity * b.buyingPrice), 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-black text-white rounded-2xl shadow-xl rotate-2">
                  <Package size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{shopName} Inventory</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Multi-Batch FIFO Control Engine</p>
              </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button 
                    onClick={() => setView('LIVE')} 
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIVE' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Live Stock
                </button>
                <button 
                    onClick={() => setView('HISTORY')} 
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'HISTORY' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Movement History
                </button>
            </div>
            <button 
                onClick={load} 
                className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-95"
            >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
      </div>

      {view === 'LIVE' ? (
        <>
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Plus size={16} className="text-blue-600" /> Register Master SKU
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Identity SKU</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                        value={newProd.sku} onChange={e => setNewProd({...newProd, sku: e.target.value})} placeholder="Ex. MW-101" />
            </div>
            <div className="md:col-span-2 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                        value={newProd.name} onChange={e => setNewProd({...newProd, name: e.target.value})} placeholder="Master Identity Name" />
            </div>
            <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Fixed Selling Price</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                        <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                            value={newProd.price} onChange={e => setNewProd({...newProd, price: parseFloat(e.target.value)})} />
                    </div>
            </div>
            </div>
            <button onClick={handleAddProduct} className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
            <Save size={16} /> Inject Master Registry
            </button>
          </div>

          <div className="space-y-4">
            {loading ? (
                <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.5em] text-slate-300">Syncing Inventory Nodes...</div>
            ) : products.map(p => {
                const totalStock = getProductStock(p);
                const isExpanded = expandedId === p.id;
                
                return (
                    <div key={p.id} className={`bg-white rounded-[2.5rem] border transition-all duration-300 ${isExpanded ? 'border-blue-200 shadow-xl ring-4 ring-blue-50' : 'border-slate-100 shadow-sm'}`}>
                        <div className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
                                <Layers size={24} />
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h4 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{p.name}</h4>
                                <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-1">
                                    <span className="text-[10px] font-mono font-bold text-blue-600 uppercase">SKU: {p.sku}</span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><History size={10}/> {p.batches.length} active batches</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 w-full md:w-auto">
                                <div className="text-center">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Selling Price</p>
                                    <p className="text-sm font-black text-emerald-600">{formatCurrency(p.price)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Total Stock</p>
                                    <p className={`text-sm font-black ${totalStock < 10 ? 'text-rose-600 animate-pulse' : 'text-slate-900'}`}>{totalStock} units</p>
                                </div>
                                <div className="text-center hidden md:block">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Cost Value</p>
                                    <p className="text-sm font-black text-slate-400">{formatCurrency(getProductCostValue(p))}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id); }} className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                                    <Trash2 size={18} />
                                </button>
                                {isExpanded ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-8 pb-8 border-t border-slate-50 animate-slide-in">
                                <div className="pt-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
                                    <div className="lg:col-span-7 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <TrendingDown size={14} className="text-blue-500"/> Batch Registry (FIFO Order)
                                            </h5>
                                            <span className="text-[9px] font-bold text-slate-300 uppercase italic">Oldest units used first</span>
                                        </div>
                                        <div className="space-y-2">
                                            {p.batches.map((batch, idx) => (
                                                <div key={batch.id} className={`flex items-center justify-between p-4 rounded-2xl border ${batch.id.startsWith('rb-') ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-black text-slate-900">{batch.quantity} units</p>
                                                                {batch.id.startsWith('rb-') && <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[7px] font-black uppercase">Returned Stock</span>}
                                                            </div>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(batch.createdAt).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            {editingBatchId === batch.id ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input 
                                                                        type="number" 
                                                                        className="w-24 bg-white border border-blue-500 rounded-lg px-2 py-1 text-xs font-black outline-none"
                                                                        value={tempPrice}
                                                                        onChange={e => setTempPrice(parseFloat(e.target.value) || 0)}
                                                                        autoFocus
                                                                    />
                                                                    <button onClick={() => handleUpdateBatchPrice(p.id, batch.id)} className="p-1.5 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-all">
                                                                        <Check size={14} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-end">
                                                                    <div className="flex items-center gap-2 group/price">
                                                                        <p className="text-xs font-black text-slate-900 uppercase">Cost: {formatCurrency(batch.buyingPrice)}</p>
                                                                        <button 
                                                                            onClick={() => { setEditingBatchId(batch.id); setTempPrice(batch.buyingPrice); }} 
                                                                            className="p-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover/price:opacity-100 transition-all"
                                                                        >
                                                                            <Edit3 size={12}/>
                                                                        </button>
                                                                    </div>
                                                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-tighter">ID: {batch.id.slice(-6)}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="lg:col-span-5 space-y-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                                        <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <Plus size={14} className="text-blue-600" /> Inject New Batch
                                        </h5>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 ml-1">Arrival Quantity</label>
                                                <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                                                    value={batchForms[p.id]?.quantity || ''} 
                                                    onChange={e => setBatchForms({...batchForms, [p.id]: { ...(batchForms[p.id] || { buyingPrice: 0 }), quantity: parseInt(e.target.value) || 0 }})} 
                                                    placeholder="Units" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 ml-1">Batch Buying Price (Unit Cost)</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                                                    <input type="number" className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                                                        value={batchForms[p.id]?.buyingPrice || ''} 
                                                        onChange={e => setBatchForms({...batchForms, [p.id]: { ...(batchForms[p.id] || { quantity: 0 }), buyingPrice: parseFloat(e.target.value) || 0 }})} 
                                                        placeholder="Cost" />
                                                </div>
                                            </div>
                                            <button onClick={() => handleAddBatch(p.id)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-blue-700 transition-all">
                                                Commit Stock Batch
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden min-h-[600px]">
            {loading ? (
                <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.5em] text-slate-300">Generating Timeline...</div>
            ) : (
                <div className="flex-1 overflow-auto no-scrollbar">
                    <table className="w-full text-left compact-table">
                        <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                            <tr className="bg-slate-50/50">
                                <th>Timestamp</th>
                                <th className="text-center">Event Type</th>
                                <th>Product SKU</th>
                                <th className="text-right">Qty</th>
                                <th>Reference</th>
                                <th className="text-right pr-8">User/System</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {historyData.length === 0 && (
                                <tr><td colSpan={6} className="py-20 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">No Movements Recorded</td></tr>
                            )}
                            {historyData.map((h, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-slate-900">{new Date(h.date).toLocaleDateString()}</span>
                                            <span className="text-[9px] font-bold text-slate-400">{new Date(h.date).toLocaleTimeString()}</span>
                                        </div>
                                    </td>
                                    <td className="text-center py-4">
                                        <div className="flex justify-center">
                                            {h.type === 'IN' ? (
                                                <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <ArrowDownLeft size={10} /> Stock In
                                                </span>
                                            ) : h.type === 'RESTOCK' ? (
                                                <span className="bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <History size={10} /> Restock
                                                </span>
                                            ) : (
                                                <span className="bg-rose-50 text-rose-600 border border-rose-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <ArrowUpRight size={10} /> Deduction
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-slate-900 uppercase">{h.productName}</span>
                                            <span className="text-[9px] font-mono font-bold text-slate-400">{h.sku}</span>
                                        </div>
                                    </td>
                                    <td className="text-right py-4">
                                        <span className={`text-[12px] font-black ${h.type === 'OUT' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {h.type === 'OUT' ? '-' : '+'}{h.quantity}
                                        </span>
                                    </td>
                                    <td className="py-4">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{h.reference}</span>
                                    </td>
                                    <td className="text-right pr-8 py-4">
                                        <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded-md">{h.user || 'System'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
