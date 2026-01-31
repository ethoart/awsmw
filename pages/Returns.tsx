
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../services/mockBackend';
import { 
    CheckCircle, 
    AlertOctagon, 
    Camera, 
    X, 
    Scan, 
    Keyboard, 
    ShieldCheck, 
    Zap, 
    Laptop, 
    Monitor, 
    Truck, 
    PackageCheck, 
    Info,
    RotateCcw,
    RefreshCcw
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { formatCurrency } from '../utils/helpers';

interface ReturnsProps {
  tenantId: string;
  shopName: string;
}

type ScanOperation = 'RETURN' | 'DISPATCH' | 'DELIVERY' | 'INFO';

export const Returns: React.FC<ReturnsProps> = ({ tenantId, shopName }) => {
  const [scanMode, setScanMode] = useState<'HARDWARE' | 'CAMERA' | 'MANUAL'>('HARDWARE');
  const [operation, setOperation] = useState<ScanOperation>('RETURN');
  const [scanInput, setScanInput] = useState('');
  const [processedOrder, setProcessedOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Hardware scanner focus logic
  useEffect(() => {
    if (scanMode === 'HARDWARE') {
        const interval = setInterval(() => {
            if (document.activeElement !== inputRef.current) {
                inputRef.current?.focus();
            }
        }, 800);
        inputRef.current?.focus();
        return () => clearInterval(interval);
    }
  }, [scanMode]);

  // Camera scanner logic using Html5Qrcode core - REFACTORED FOR BARCODES
  useEffect(() => {
      const initCamera = async () => {
          if (scanMode === 'CAMERA') {
              try {
                  const html5QrCode = new Html5Qrcode("reader");
                  html5QrCodeRef.current = html5QrCode;
                  
                  // Explicitly support 1D Barcode formats common in logistics
                  const formatsToSupport = [
                      Html5QrcodeSupportedFormats.CODE_128,
                      Html5QrcodeSupportedFormats.CODE_39,
                      Html5QrcodeSupportedFormats.CODE_93,
                      Html5QrcodeSupportedFormats.EAN_13,
                      Html5QrcodeSupportedFormats.EAN_8,
                      Html5QrcodeSupportedFormats.UPC_A,
                      Html5QrcodeSupportedFormats.UPC_E,
                      Html5QrcodeSupportedFormats.ITF,
                      Html5QrcodeSupportedFormats.QR_CODE
                  ];

                  await html5QrCode.start(
                      { facingMode: "environment" },
                      {
                          fps: 20, // High frame rate for fast barcode locking
                          // Optimized horizontal scan area for standard barcodes
                          qrbox: (viewfinderWidth, viewfinderHeight) => {
                              const width = viewfinderWidth * 0.85;
                              const height = Math.min(viewfinderHeight * 0.35, 180);
                              return { width, height };
                          },
                          aspectRatio: 1.0,
                          formatsToSupport: formatsToSupport
                      },
                      (decodedText) => {
                          handleScanProcess(decodedText);
                      },
                      () => {
                          // Ignore scanning errors (no code in view)
                      }
                  );
                  setIsCameraActive(true);
              } catch (err) {
                  console.error("Barcode Camera Init Failed:", err);
                  setError("Camera Access Denied or Initialization Failure.");
              }
          }
      };

      initCamera();

      return () => {
          if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
              html5QrCodeRef.current.stop().then(() => {
                  html5QrCodeRef.current?.clear();
                  setIsCameraActive(false);
              }).catch(err => console.error("Camera Release Error:", err));
          }
      };
  }, [scanMode]);

  const handleScanProcess = async (code: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProcessedOrder(null);
    
    const cleanCode = code.trim();
    if (!cleanCode) { setIsProcessing(false); return; }
    
    try {
      let result: Order | null = null;
      
      if (operation === 'RETURN') {
          result = await db.processReturn(cleanCode, tenantId);
      } else if (operation === 'DISPATCH') {
          const order = await db.getOrder(cleanCode, tenantId);
          if (order) {
              result = await db.shipOrder(order, tenantId);
          }
      } else if (operation === 'DELIVERY') {
          const order = await db.getOrder(cleanCode, tenantId);
          if (order) {
              const updated = { ...order, status: OrderStatus.DELIVERED, deliveredAt: new Date().toISOString() };
              await db.updateOrder(updated);
              result = updated;
          }
      } else {
          const order = await db.getOrder(cleanCode, tenantId);
          result = order || null;
      }

      if (result) { 
          setProcessedOrder(result); 
          setScanInput(''); 
          try { new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3').play(); } catch(e){}
      } else { 
          setError(`Reference "${cleanCode}" not found in cluster registry.`); 
          setScanInput('');
      }
    } catch (err: any) { 
        setError(err.message || 'Registry Handshake Failure.'); 
        setScanInput('');
    } finally {
        setIsProcessing(false);
    }
  };

  const getOpTitle = () => {
      switch(operation) {
          case 'RETURN': return 'Return & Restock';
          case 'DISPATCH': return 'Logistics Dispatch';
          case 'DELIVERY': return 'Proof of Delivery';
          case 'INFO': return 'Registry Lookup';
      }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 animate-slide-in pb-20">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-blue-600 rounded-[2.2rem] flex items-center justify-center mx-auto shadow-2xl rotate-3 border-4 border-white mb-6">
            <Scan size={40} className="text-white" />
        </div>
        <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Milky Way OMS</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-2">Enterprise Barcode Scan Terminal</p>
        </div>
        
        {/* Operation Selectors */}
        <div className="flex flex-wrap justify-center gap-3 mt-10">
            {[
                { id: 'RETURN', label: 'Return', icon: <RotateCcw size={16}/>, color: 'hover:bg-rose-50 hover:text-rose-600', active: 'bg-rose-600 text-white' },
                { id: 'DISPATCH', label: 'Dispatch', icon: <Truck size={16}/>, color: 'hover:bg-blue-50 hover:text-blue-600', active: 'bg-blue-600 text-white' },
                { id: 'DELIVERY', label: 'Delivery', icon: <PackageCheck size={16}/>, color: 'hover:bg-emerald-50 hover:text-emerald-600', active: 'bg-emerald-600 text-white' },
                { id: 'INFO', label: 'Inspect', icon: <Info size={16}/>, color: 'hover:bg-slate-100 hover:text-slate-900', active: 'bg-slate-900 text-white' }
            ].map(op => (
                <button 
                    key={op.id}
                    onClick={() => { setOperation(op.id as ScanOperation); setProcessedOrder(null); setError(null); }}
                    className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border border-slate-100 ${operation === op.id ? op.active : 'bg-white text-slate-400 ' + op.color}`}
                >
                    {op.icon} {op.label}
                </button>
            ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button 
                onClick={() => setScanMode('HARDWARE')} 
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${scanMode === 'HARDWARE' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
            >
                <Laptop size={14}/> Laser Bridge
            </button>
            <button 
                onClick={() => setScanMode('CAMERA')} 
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${scanMode === 'CAMERA' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
            >
                <Camera size={14}/> Lens (Barcode)
            </button>
            <button 
                onClick={() => setScanMode('MANUAL')} 
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${scanMode === 'MANUAL' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
            >
                <Keyboard size={14}/> Manual
            </button>
        </div>
      </div>

      <div className="w-full bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
        {scanMode === 'CAMERA' ? (
            <div className="animate-slide-in space-y-6">
                <div className="relative overflow-hidden rounded-[2.5rem] border-8 border-slate-50 bg-slate-950 aspect-[16/9] max-w-2xl mx-auto shadow-inner">
                    <div id="reader" className="w-full h-full"></div>
                    {!isCameraActive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 space-y-4">
                            <RefreshCcw size={32} className="animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Initialising Barcode Lens...</p>
                        </div>
                    )}
                    {isCameraActive && (
                        <div className="absolute inset-0 border-2 border-blue-500/20 pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[30%] border-2 border-dashed border-white/50 rounded-lg"></div>
                            <div className="absolute top-1/2 left-0 right-0 h-px bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)] animate-pulse"></div>
                        </div>
                    )}
                </div>
                <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Center the barcode horizontally within the red guide</p>
                </div>
            </div>
        ) : (
            <div className="animate-slide-in space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                            {scanMode === 'HARDWARE' ? <Monitor size={24} /> : <Keyboard size={24} />}
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest">
                                {getOpTitle()} Terminal
                            </h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">
                                {scanMode === 'HARDWARE' ? 'Ready for Hardware Scanner' : 'Input Reference ID'}
                            </p>
                        </div>
                    </div>
                    {isProcessing && <Zap size={20} className="text-blue-500 animate-pulse" />}
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleScanProcess(scanInput); }} className="relative group">
                    <input 
                        ref={inputRef} 
                        type="text" 
                        autoFocus
                        value={scanInput} 
                        onChange={(e) => setScanInput(e.target.value)} 
                        className="w-full bg-slate-50 border-4 border-slate-100 text-slate-900 text-3xl font-black text-center py-12 rounded-[3.5rem] focus:border-blue-600 outline-none transition-all placeholder:text-slate-200 uppercase" 
                        placeholder={scanMode === 'HARDWARE' ? "AWAITING BEAM..." : "TYPE ID..."}
                    />
                    <div className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-200">
                        {scanMode === 'HARDWARE' ? <Scan size={44} /> : <Keyboard size={44} />}
                    </div>
                </form>
            </div>
        )}

        <div className="mt-10 min-h-[140px]">
            {processedOrder && (
                <div className="bg-slate-50 border-2 border-slate-100 p-8 rounded-[3rem] animate-slide-in shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-2xl"></div>
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="w-20 h-20 bg-emerald-600 text-white rounded-[1.8rem] flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                            <ShieldCheck size={40} />
                        </div>
                        <div className="flex-1 space-y-2 text-center md:text-left">
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                <h3 className="font-black uppercase text-2xl tracking-tighter text-slate-900">{processedOrder.customerName}</h3>
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest">SYNCED</span>
                            </div>
                            <div className="flex flex-wrap justify-center md:justify-start gap-4 text-[11px] font-black uppercase text-slate-400">
                                <span>Ref: {processedOrder.id.slice(-8)}</span>
                                <span className="text-blue-600">COD: {formatCurrency(processedOrder.totalAmount)}</span>
                                <span className="text-indigo-600">Status: {processedOrder.status}</span>
                            </div>
                        </div>
                        <button onClick={() => setProcessedOrder(null)} className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 rounded-2xl transition-all shadow-sm"><X size={20}/></button>
                    </div>
                </div>
            )}
            {error && (
                <div className="bg-rose-50 border-2 border-rose-100 p-8 rounded-[2.5rem] flex items-center gap-6 text-rose-600 animate-shake shadow-xl shadow-rose-500/10">
                    <div className="w-16 h-16 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                        <AlertOctagon size={32} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-black uppercase text-xl tracking-tight leading-none mb-2">Protocol Denied</h3>
                        <p className="text-[11px] font-black opacity-70 uppercase leading-relaxed">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="p-2 hover:bg-rose-100 rounded-xl transition-all"><X size={24}/></button>
                </div>
            )}
            {!processedOrder && !error && (
                <div className="h-full flex flex-col items-center justify-center text-slate-200 py-8 opacity-40">
                    <Zap size={56} className="mb-4" />
                    <p className="text-[11px] font-black uppercase tracking-[0.5em]">{shopName} Node Ready</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
