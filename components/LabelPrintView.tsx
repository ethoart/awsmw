
import React from 'react';
import Barcode from 'react-barcode';
import { Order, TenantSettings } from '../types';

interface LabelPrintViewProps {
  orders: Order[];
  settings: TenantSettings;
}

export const LabelPrintView: React.FC<LabelPrintViewProps> = ({ orders, settings }) => {
  return (
    <div className="print-only w-full bg-white text-black font-sans p-0">
      <style>{`
        @page { 
          margin: 0 !important; 
          size: A4 portrait;
        }
        @media print {
            body { 
              margin: 0; 
              padding: 0; 
              -webkit-print-color-adjust: exact; 
            }
            * {
              box-sizing: border-box;
            }
            .label-page { 
                page-break-after: always; 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                grid-template-rows: repeat(3, 1fr); 
                height: 297mm;
                width: 210mm;
                margin: 0 auto;
                overflow: hidden;
            }
            .label-item { 
                border: 0.1pt dashed #ddd;
                padding: 6mm 7mm; 
                display: flex; 
                flex-direction: column; 
                justify-content: space-between; 
                overflow: hidden;
                height: 99mm;
                background: white;
            }
        }
      `}</style>
      
      {Array.from({ length: Math.ceil(orders.length / 6) }).map((_, pageIdx) => (
        <div key={pageIdx} className="label-page">
          {orders.slice(pageIdx * 6, (pageIdx + 1) * 6).map((order) => {
            const displayId = order.trackingNumber || order.id;
            const productName = order.items[0]?.name || 'Item';
            
            return (
              <div key={order.id} className="label-item">
                <div className="flex flex-col gap-1">
                  <div className="space-y-0.5">
                    <p className="text-[12px] font-normal leading-none mb-1">To:</p>
                    <div className="text-[15px] leading-tight uppercase">
                      <span className="font-black">{order.customerName}</span>
                      <span className="font-black ml-1">({productName})</span>
                    </div>
                    <p className="text-[15px] font-normal leading-tight mt-1 line-clamp-2 min-h-[2em]">
                      {order.customerAddress} {order.customerCity ? `[${order.customerCity.toUpperCase()}]` : ''}
                    </p>
                    <div className="mt-2">
                        <p className="text-[18px] font-black tracking-tighter leading-none">
                          {order.customerPhone}{order.customerPhone2 ? ` / ${order.customerPhone2}` : ''}
                        </p>
                    </div>
                  </div>

                  <div className="mt-3 mb-1">
                    <h1 className="text-[34px] font-black tracking-tighter leading-none">
                      COD: Rs.{order.totalAmount.toLocaleString()}
                    </h1>
                  </div>

                  <div className="border-t-[1pt] border-black border-dashed my-2 w-full opacity-30"></div>

                  <div className="space-y-0.5">
                    <p className="text-[10px] font-normal leading-none mb-1">From:</p>
                    <p className="text-[12px] font-black uppercase leading-tight truncate">{settings.shopName}</p>
                    <p className="text-[9px] font-bold text-gray-700 leading-tight line-clamp-1">{settings.shopAddress}</p>
                    <p className="text-[10px] font-black leading-none">{settings.shopPhone}</p>
                    <p className="text-[7px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">OMS Ref: {order.id}</p>
                  </div>
                </div>

                <div className="flex flex-col items-center mt-auto pb-1">
                  <Barcode 
                    value={displayId} 
                    width={1.5} 
                    height={35} 
                    fontSize={10} 
                    font="monospace" 
                    background="transparent"
                    format="CODE128"
                    margin={0}
                  />
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-1 leading-none">
                    {displayId}
                  </p>
                </div>
              </div>
            );
          })}
          {Array.from({ length: 6 - orders.slice(pageIdx * 6, (pageIdx + 1) * 6).length }).map((_, i) => (
            <div key={`empty-${i}`} className="label-item opacity-0"></div>
          ))}
        </div>
      ))}
    </div>
  );
};
