
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
// Standard Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Fallback Parser: Capture anything else (like text/plain, multipart without multer, or missing content-type) as string
app.use(express.text({ type: '*/*', limit: '50mb' }));

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
  202: "Invalid Order ID (Numeric Required)",
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

const mapStatus = (courierStatus) => {
    const s = (courierStatus || '').toLowerCase();
    
    // Priority: Delivered check
    if (s.includes('delivered')) return 'DELIVERED';

    // Distinguish between forward Transfer and Return Transfer
    if (s.includes('return') && s.includes('transfer')) return 'RETURN_TRANSFER';
    if (s.includes('transfer')) return 'TRANSFER';

    if (s.includes('returned')) return 'RETURNED';
    if (s.includes('handover')) return 'RETURN_HANDOVER';
    if (s.includes('transfer')) return 'RETURN_TRANSFER';
    if (s.includes('system')) return 'RETURN_AS_ON_SYSTEM';
    if (s.includes('delivery')) return 'DELIVERY';
    if (s.includes('residual')) return 'RESIDUAL';
    if (s.includes('rearrange')) return 'REARRANGE';
    if (s.includes('waiting')) return 'PENDING';
    return 'SHIPPED'; 
};

const clean = (obj) => {
  if (!obj) return obj;
  const { _id, ...rest } = obj;
  return rest;
};

// Helper: Parse raw multipart string manually without external libs
function parseMultipartData(rawBody) {
    const result = {};
    if (!rawBody || typeof rawBody !== 'string') return result;
    
    // 1. Identify Boundary (scan first few lines)
    const lines = rawBody.split(/\r?\n/);
    let boundary = '';
    for (const line of lines) {
        if (line.trim().startsWith('--')) {
            boundary = line.trim();
            break;
        }
    }
    if (!boundary) return result;

    // 2. Split by boundary
    const parts = rawBody.split(boundary);

    for (const part of parts) {
        // 3. Find Name
        if (!part || !part.includes('name="')) continue;
        const nameMatch = part.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        
        const name = nameMatch[1];
        
        // 4. Find Value (content after double newline)
        const headerMatch = part.match(/\r?\n\r?\n/);
        if (!headerMatch) continue;

        const valueStart = headerMatch.index + headerMatch[0].length;
        let value = part.substring(valueStart).trim();
        
        // Cleanup trailing dashes from end of body
        if (value.endsWith('--')) value = value.substring(0, value.length - 2).trim();
        
        result[name] = value;
    }
    return result;
}

app.get('/api/health', (req, res) => res.json({ status: 'connected' }));

app.post('/api/login', async (req, res) => {
    try {
        const db = await connectCentral();
        const { username, password } = req.body;
        const user = await db.collection('users').findOne({ username, password });
        if (user) res.json(clean(user));
        else res.status(401).json({ error: 'Identity failure' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cities', async (req, res) => {
    try {
        const db = await connectCentral();
        const cityDoc = await db.collection('global_cities').findOne({ id: 'master_list' });
        res.json({ cities: cityDoc?.cities || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cities', async (req, res) => {
    try {
        const db = await connectCentral();
        const { cities } = req.body;
        await db.collection('global_cities').updateOne({ id: 'master_list' }, { $set: { cities } }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await connectCentral();
        const users = await db.collection('users').find({ tenantId }).toArray();
        res.json(users.map(clean));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = req.body;
        const db = await connectCentral();
        await db.collection('users').updateOne({ id: user.id }, { $set: clean(user) }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users', async (req, res) => {
    try {
        const { id } = req.query;
        const db = await connectCentral();
        await db.collection('users').deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, page, limit, search, status, productId, startDate, endDate } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (id) {
            let order = await col.findOne({ id });
            return res.json(clean(order));
        }

        const query = { tenantId };
        
        if (status && status !== 'ALL') {
            if (status === 'TODAY_SHIPPED') {
                const dateToMatch = startDate || new Date().toISOString().split('T')[0];
                query.shippedAt = { $regex: `^${dateToMatch}` };
            } else {
                query.status = status;
            }
        }

        if (productId) query['items.productId'] = productId;
        
        if (!query.shippedAt && (startDate || endDate)) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = startDate;
            if (endDate) query.createdAt.$lte = endDate + 'T23:59:59';
        }

        if (search) {
            query.$or = [
                { id: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } },
                { trackingNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 50;
        const total = await col.countDocuments(query);
        const data = await col.find(query).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).toArray();

        res.json({ data: data.map(clean), total, page: p, limit: l });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const { order, orders } = req.body;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (orders) {
            const ops = orders.map(o => ({ 
                updateOne: { 
                    filter: { id: o.id }, 
                    update: { $set: { ...clean(o), tenantId } }, 
                    upsert: true 
                } 
            }));
            await col.bulkWrite(ops);
        } else if (order) {
            await col.updateOne({ id: order.id }, { $set: { ...clean(order), tenantId } }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.get('/api/customer-history', async (req, res) => {
    try {
        const { phone, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        const count = await db.collection('orders').countDocuments({ customerPhone: { $regex: last8 + "$" } });
        const returns = await db.collection('orders').countDocuments({ 
            customerPhone: { $regex: last8 + "$" }, 
            status: { $in: ['RETURNED', 'REJECTED', 'RETURN_COMPLETED'] } 
        });
        res.json({ count, returns });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customer-history-detailed', async (req, res) => {
    try {
        const { phone, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        const all = await db.collection('orders').find({ customerPhone: { $regex: last8 + "$" } }).sort({ createdAt: -1 }).toArray();
        res.json(all.map(clean));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/process-return', async (req, res) => {
    try {
        const { trackingOrId, tenantId } = req.body;
        const db = await getTenantDb(tenantId);
        const ordersCol = db.collection('orders');
        const prodCol = db.collection('products');
        
        const order = await ordersCol.findOne({ $or: [{ id: trackingOrId }, { trackingNumber: trackingOrId }] });
        
        if (order) {
            if (order.status !== 'RETURN_COMPLETED') {
                for (const item of order.items) {
                    const product = await prodCol.findOne({ id: item.productId });
                    if (product) {
                        const batches = product.batches || [];
                        const returnBatch = {
                            id: `rb-${Date.now()}`,
                            quantity: item.quantity,
                            buyingPrice: item.price * 0.7,
                            createdAt: new Date().toISOString(),
                            isReturn: true
                        };
                        await prodCol.updateOne(
                            { id: item.productId },
                            { $push: { batches: returnBatch } }
                        );
                    }
                }
            }

            const updated = { 
                ...order, 
                status: 'RETURN_COMPLETED',
                logs: [...(order.logs || []), { id: `rl-${Date.now()}`, message: 'Return Processed: Stock Restored to Registry', timestamp: new Date().toISOString(), user: 'OMS Scanner' }]
            };
            await ordersCol.updateOne({ id: order.id }, { $set: clean(updated) });
            return res.json(updated);
        }
        res.status(404).json({ error: 'Order reference not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Courier Webhook Endpoint (Reverse API)
app.post('/api/courier-webhook', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    
    try {
        let body = req.body || {};
        
        // --- ROBUST BODY PARSING START ---
        if (typeof body === 'string') {
            // 1. Try JSON
            try { 
                const json = JSON.parse(body);
                if (json && typeof json === 'object') body = json;
            } catch (e) {
                // 2. Try Multipart Form Data (Custom Parser) or URL Encoded
                if (body.includes('Content-Disposition: form-data')) {
                    body = parseMultipartData(body);
                } else if (body.includes('=')) {
                    // Try parsing as URL encoded string if it looks like one
                    const params = new URLSearchParams(body);
                    if (params.has('waybill_id')) {
                        body = Object.fromEntries(params);
                    }
                }
            }
        }

        // 4. Handle JSON-as-key edge case (Curl quirks)
        if (!body.waybill_id && !body.waybillId && typeof body === 'object') {
            const keys = Object.keys(body);
            if (keys.length === 1 && keys[0].trim().startsWith('{')) {
                try {
                    const parsedKey = JSON.parse(keys[0]);
                    if (parsedKey.waybill_id || parsedKey.waybillId) {
                        body = parsedKey;
                    }
                } catch(e) {}
            }
        }

        // 5. Query Param Fallback
        if ((!body || Object.keys(body).length === 0) && req.query) {
            body = req.query;
        }
        // --- ROBUST BODY PARSING END ---

        const waybill_id = body.waybill_id || body.waybillId;
        const statusRaw = body.delivery_status || body.current_status || body.status;
        const lastUpdate = body.last_update_time || new Date().toISOString();

        console.log(">>> Reverse API Hit:", { waybill_id, statusRaw, contentType: req.headers['content-type'] });

        if (!waybill_id) {
            return res.status(400).json({ 
                error: 'Bad Request: waybill_id missing', 
                receivedBody: body 
            });
        }

        await handleWebhookUpdate(waybill_id, statusRaw, lastUpdate, res);
    } catch (e) {
        console.error("Webhook Error:", e);
        res.status(500).send(e.message);
    }
});

async function handleWebhookUpdate(waybill_id, statusRaw, lastUpdate, res) {
    const central = await connectCentral();
    const tenants = await central.collection('tenants').find({ isActive: true }).toArray();
    let found = false;

    // Normalize waybill for search (trim whitespace)
    const cleanWaybill = String(waybill_id).trim();

    for (const tenant of tenants) {
        try {
            const db = await getTenantDb(tenant.id);
            // Search using regex to be case insensitive and robust
            const order = await db.collection('orders').findOne({ 
                trackingNumber: { $regex: `^${cleanWaybill}$`, $options: 'i' } 
            });
            
            if (order) {
                found = true;
                const newStatus = mapStatus(statusRaw);
                
                if (order.status !== newStatus) {
                    await db.collection('orders').updateOne(
                        { id: order.id },
                        {
                            $set: { status: newStatus, courierStatus: statusRaw },
                            $push: { logs: {
                                id: `l-${Date.now()}`,
                                message: `WEBHOOK: Status update to ${statusRaw} [Time: ${lastUpdate}]`,
                                timestamp: new Date().toISOString(),
                                user: 'Courier System'
                            }}
                        }
                    );
                }
                return res.status(200).send('Success');
            }
        } catch (err) {
            console.error(`Tenant ${tenant.id} scan failed:`, err);
        }
    }
    
    if (!found) {
        // Return 200 even if not found to stop courier retries if valid waybill but not in our system
        res.status(200).send('Waybill Processed (Not in Registry)');
    }
}

app.post('/api/ship-order', async (req, res) => {
    try {
        const { order, tenantId } = req.body;
        const db = await getTenantDb(tenantId);
        const central = await connectCentral();
        const tenantDoc = await central.collection('tenants').findOne({ id: tenantId });
        const settings = tenantDoc?.settings;
        
        if (!settings || !settings.courierApiKey) return res.status(400).json({ error: "Keys Missing" });

        const fdeOrderId = order.id.replace(/\D/g, '').slice(-10) || Math.floor(Math.random() * 1000000000).toString();

        const formData = new URLSearchParams();
        formData.append('api_key', settings.courierApiKey.trim());
        formData.append('client_id', settings.courierClientId.trim());
        formData.append('order_id', fdeOrderId);
        formData.append('parcel_weight', order.parcelWeight || '1');
        formData.append('parcel_description', (order.parcelDescription || order.items[0]?.name || 'Standard Shipment').toString().slice(0, 50));
        formData.append('recipient_name', order.customerName.toString());
        formData.append('recipient_contact_1', order.customerPhone.replace(/\D/g, ''));
        
        const phone2 = (order.customerPhone2 || '').replace(/\D/g, '');
        if (phone2) formData.append('recipient_contact_2', phone2);

        formData.append('recipient_address', order.customerAddress.toString());
        formData.append('recipient_city', (order.customerCity || '').toString());
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
            return res.status(400).json({ error: `FDE Text: ${rawText.slice(0, 150)}` });
        }

        const status = Number(data.status);
        if (status === 200) {
            const newWaybill = data.waybill_no ? String(data.waybill_no).trim() : (order.trackingNumber || '').trim();
            const updated = { 
                ...order, 
                status: 'SHIPPED', 
                trackingNumber: newWaybill, 
                shippedAt: new Date().toISOString(),
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'FDE Handshake: Success', timestamp: new Date().toISOString(), user: 'OMS Connector' }]
            };
            await db.collection('orders').updateOne({ id: order.id }, { $set: clean(updated) });
            res.json(updated);
        } else {
            res.status(400).json({ error: FDE_ERRORS[status] || `FDE Status ${status}` });
        }
    } catch (e) { res.status(500).json({ error: `System Handshake Failure: ${e.message}` }); }
});

app.get('/api/tenants', async (req, res) => {
    try {
        const db = await connectCentral();
        res.json(await db.collection('tenants').find({}).toArray());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.all('/api/tenants', async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return res.status(405).end();
    try {
        const db = await connectCentral();
        const { tenant, adminUser } = req.body;
        if (!tenant || !tenant.id) return res.status(400).json({ error: 'Invalid tenant payload' });
        
        await db.collection('tenants').updateOne(
            { id: tenant.id }, 
            { $set: clean(tenant) }, 
            { upsert: true }
        );
        
        if (adminUser) {
            await db.collection('users').updateOne(
                { tenantId: tenant.id, role: 'SUPER_ADMIN' }, 
                { $set: clean(adminUser) }, 
                { upsert: true }
            );
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        res.json(await db.collection('products').find({ tenantId }).toArray());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const { product } = req.body;
        const db = await getTenantDb(tenantId);
        await db.collection('products').updateOne({ id: product.id }, { $set: { ...clean(product), tenantId } }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products', async (req, res) => {
    try {
        const { id, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        await db.collection('products').deleteOne({ id, tenantId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not matched.' });
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`>>> MW-OMS Local Node Port ${PORT}`);
    try { await connectCentral(); } catch (e) {}
});
