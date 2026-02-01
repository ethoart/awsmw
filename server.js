
import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;
const CENTRAL_DB_NAME = 'milkyway_central';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

let centralClient;
let centralDb;

async function connectCentral() {
    if (!centralClient) {
        if (!MONGODB_URI) throw new Error("MONGODB_URI is missing");
        try {
            centralClient = new MongoClient(MONGODB_URI, {
                serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
                connectTimeoutMS: 15000
            });
            await centralClient.connect();
            centralDb = centralClient.db(CENTRAL_DB_NAME);
            console.log(">>> MW-OMS Master Node Active.");
        } catch (err) {
            centralClient = null;
            throw err;
        }
    }
    return centralDb;
}

const tenantClients = new Map();
async function getTenantDb(tenantId) {
    const db = await connectCentral();
    const tenantConfig = await db.collection('tenants').findOne({ id: tenantId });
    if (tenantConfig && tenantConfig.mongoUri) {
        if (tenantClients.has(tenantId)) return tenantClients.get(tenantId).db();
        try {
            const tClient = new MongoClient(tenantConfig.mongoUri);
            await tClient.connect();
            tenantClients.set(tenantId, tClient);
            return tClient.db();
        } catch (err) { return db; }
    }
    return db;
}

const FDE_ERRORS = {
  201: "Inactive Client",
  202: "Invalid Order ID",
  203: "Invalid Weight",
  204: "Invalid Parcel Description",
  205: "Invalid Name",
  206: "Contact Number 1 Invalid",
  207: "Contact Number 2 Invalid",
  208: "Invalid Address",
  209: "Invalid City Name",
  210: "Insert Failed",
  211: "Invalid API Key",
  212: "Invalid or Inactive Client",
  213: "Invalid Exchange Value",
  214: "Maintenance Mode"
};

app.get('/api/health', (req, res) => res.json({ status: 'connected' }));

app.post('/api/ship-order', async (req, res) => {
    try {
        const { order, tenantId } = req.body;
        const db = await getTenantDb(tenantId);
        const central = await connectCentral();
        const tenantDoc = await central.collection('tenants').findOne({ id: tenantId });
        const settings = tenantDoc?.settings;
        
        if (!settings || !settings.courierApiKey) return res.status(400).json({ error: "Keys Missing" });

        const formData = new URLSearchParams();
        formData.append('api_key', settings.courierApiKey.trim());
        formData.append('client_id', settings.courierClientId.trim());
        formData.append('order_id', order.id.toString());
        formData.append('parcel_weight', order.parcelWeight || '1');
        formData.append('parcel_description', order.parcelDescription || order.items[0]?.name || 'Standard Shipment');
        formData.append('recipient_name', order.customerName);
        formData.append('recipient_contact_1', order.customerPhone.replace(/\D/g, ''));
        formData.append('recipient_contact_2', (order.customerPhone2 || '').replace(/\D/g, ''));
        formData.append('recipient_address', order.customerAddress);
        formData.append('recipient_city', order.customerCity || 'Colombo');
        formData.append('amount', Math.round(order.totalAmount).toString());
        formData.append('exchange', '0');

        const targetUrl = settings.courierMode === 'EXISTING_WAYBILL' 
            ? 'https://www.fdedomestic.com/api/parcel/existing_waybill_api_v1.php'
            : 'https://www.fdedomestic.com/api/parcel/new_api_v1.php';

        if (settings.courierMode === 'EXISTING_WAYBILL') {
            formData.append('waybill_id', (order.trackingNumber || '').toString());
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        
        const rawText = await response.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (err) {
            return res.status(400).json({ error: `FDE Text: ${rawText.slice(0, 100)}` });
        }

        const status = Number(data.status);
        if (status === 200) {
            const updated = { 
                ...order, status: 'SHIPPED', 
                trackingNumber: data.waybill_no || order.trackingNumber, 
                shippedAt: new Date().toISOString(),
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'FDE Protocol Accepted', timestamp: new Date().toISOString(), user: 'OMS Connector' }]
            };
            await db.collection('orders').updateOne({ id: order.id }, { $set: updated });
            res.json(updated);
        } else {
            res.status(400).json({ error: FDE_ERRORS[status] || `FDE Status ${status}` });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync other methods like DELETE to ensure tenantId query param use
app.delete('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, purge } = req.query;
        if (!tenantId) return res.status(400).json({ error: 'Context Required' });
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');
        if (purge === 'true') {
            const result = await col.deleteMany({ tenantId });
            return res.json({ success: true, count: result.deletedCount });
        }
        if (id) {
            const ids = id.split(',');
            const result = await col.deleteMany({ id: { $in: ids }, tenantId });
            return res.json({ success: true, count: result.deletedCount });
        }
        res.status(400).json({ error: 'Missing Target' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not Found' });
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`>>> MW-OMS Local Node Port ${PORT}`);
    try { await connectCentral(); } catch (e) {}
});
