import { Handler } from "@netlify/functions";
import { MongoClient, ObjectId } from "mongodb";

const CENTRAL_URI = process.env.MONGODB_URI;
const CENTRAL_DB_NAME = 'milkyway_central';

let cachedCentralClient: MongoClient | null = null;
const tenantClients = new Map<string, MongoClient>();

async function getCentralDb() {
  if (cachedCentralClient) return cachedCentralClient.db(CENTRAL_DB_NAME);
  if (!CENTRAL_URI) throw new Error('MONGODB_URI environment variable is missing.');
  const client = new MongoClient(CENTRAL_URI);
  await client.connect();
  cachedCentralClient = client;
  return client.db(CENTRAL_DB_NAME);
}

async function getTenantDb(tenantId: string) {
    if (!tenantId) throw new Error("Tenant ID is required");
    const decodedTenantId = decodeURIComponent(tenantId.replace(/\+/g, ' '));
    
    const central = await getCentralDb();
    const tenant = await central.collection('tenants').findOne({ id: decodedTenantId });
    if (!tenant) throw new Error(`Tenant ${decodedTenantId} not found`);
    
    const uri = tenant.mongoUri || CENTRAL_URI;
    if (tenantClients.has(decodedTenantId)) return tenantClients.get(decodedTenantId)!.db();
    
    const client = new MongoClient(uri);
    await client.connect();
    tenantClients.set(decodedTenantId, client);
    return client.db();
}

export const handler: Handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Normalize path: remove /.netlify/functions/api or /api prefix
  let path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
  if (!path.startsWith('/')) path = '/' + path;
  
  const method = event.httpMethod;
  const query = event.queryStringParameters || {};
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    if (path === '/health') return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };

    // Login
    if (path === '/login' && method === 'POST') {
        const { username, password } = body;
        const central = await getCentralDb();
        
        // Check dev admin
        if (username === 'dev' && password === 'admin') {
            return { statusCode: 200, headers, body: JSON.stringify({ id: 'dev-admin', username: 'dev', role: 'DEV_ADMIN' }) };
        }

        // Check tenant users
        // This requires iterating tenants or having a central user registry.
        // For now, we assume users are stored in tenants.
        // But login usually needs to know tenant first or search all.
        // Here we implement a simple search across active tenants for simplicity, or rely on tenantId if provided.
        // But the login UI doesn't ask for tenant ID.
        // So we search all tenants? That's slow.
        // Maybe we check central users collection if it exists?
        
        // Mock implementation for now:
        // If username is email, we might find it in central users?
        // Let's assume we search in central 'users' collection if it exists.
        const user = await central.collection('users').findOne({ username, password });
        if (user) return { statusCode: 200, headers, body: JSON.stringify(user) };

        // If not found in central, check tenants (expensive but necessary if no central auth)
        const tenants = await central.collection('tenants').find({ isActive: true }).toArray();
        for (const t of tenants) {
            try {
                const db = await getTenantDb(t.id);
                const u = await db.collection('users').findOne({ username, password });
                if (u) return { statusCode: 200, headers, body: JSON.stringify({ ...u, tenantId: t.id }) };
            } catch (e) { continue; }
        }

        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    // Tenant routes
    if (path === '/tenants') {
        const central = await getCentralDb();
        if (method === 'GET') {
            const tenants = await central.collection('tenants').find({}).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(tenants) };
        }
        if (method === 'POST') {
            const { tenant, adminUser } = body;
            await central.collection('tenants').insertOne(tenant);
            if (adminUser) {
                const db = await getTenantDb(tenant.id);
                await db.collection('users').insertOne({ ...adminUser, role: 'ADMIN', tenantId: tenant.id });
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        if (method === 'PUT') {
            const { tenant } = body;
            await central.collection('tenants').updateOne({ id: tenant.id }, { $set: tenant });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        if (method === 'DELETE') {
            const { id } = query;
            await central.collection('tenants').deleteOne({ id });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
    }

    // Products
    if (path === '/products') {
        const tenantId = query.tenantId || body.tenantId;
        const db = await getTenantDb(tenantId);
        const col = db.collection('products');
        
        if (method === 'GET') {
            const products = await col.find({}).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(products) };
        }
        if (method === 'POST') {
            const { product } = body;
            if (product._id) delete product._id; // Avoid immutable field error
            await col.updateOne({ id: product.id }, { $set: product }, { upsert: true });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        if (method === 'DELETE') {
            const { id } = query;
            await col.deleteOne({ id });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
    }

    // Orders
    if (path === '/orders') {
        const tenantId = query.tenantId || body.tenantId;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (method === 'GET') {
            const { id, search, status, limit, page } = query;
            const filter: any = {};
            if (id) filter.id = id;
            if (status && status !== 'LOGISTICS_ALL' && status !== 'TODAY_SHIPPED') {
                filter.status = status;
            }
            if (search) {
                filter.$or = [
                    { id: { $regex: search, $options: 'i' } },
                    { customerName: { $regex: search, $options: 'i' } },
                    { customerPhone: { $regex: search, $options: 'i' } }
                ];
            }
            
            const l = parseInt(limit) || 50;
            const p = parseInt(page) || 1;
            const skip = (p - 1) * l;
            
            const total = await col.countDocuments(filter);
            const data = await col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).toArray();
            
            return { statusCode: 200, headers, body: JSON.stringify({ data, total }) };
        }
        if (method === 'POST') {
            const { order, orders } = body;
            if (orders) {
                await col.insertMany(orders);
            } else if (order) {
                if (order._id) delete order._id;
                await col.updateOne({ id: order.id }, { $set: order }, { upsert: true });
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        if (method === 'DELETE') {
            const { id, purge } = query;
            if (purge === 'true') {
                const res = await col.deleteMany({});
                return { statusCode: 200, headers, body: JSON.stringify({ count: res.deletedCount }) };
            }
            await col.deleteOne({ id });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
    }

    // Users
    if (path === '/users') {
        const tenantId = query.tenantId || body.tenantId;
        const db = await getTenantDb(tenantId);
        const col = db.collection('users');
        
        if (method === 'GET') {
            const users = await col.find({}).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(users) };
        }
        if (method === 'POST') {
            const user = body;
            await col.insertOne(user);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        if (method === 'DELETE') {
            const { id } = query;
            await col.deleteOne({ id });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
    }

    // Customer History
    if (path === '/customer-history') {
        const { phone, tenantId } = query;
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        
        const count = await db.collection('orders').countDocuments({ customerPhone: { $regex: last8 + "$" } });
        const returns = await db.collection('orders').countDocuments({ 
            customerPhone: { $regex: last8 + "$" }, 
            status: { $in: ['RETURNED', 'REJECTED', 'RETURN_COMPLETED'] } 
        });
        const waybills = await db.collection('orders').countDocuments({
            customerPhone: { $regex: last8 + "$" },
            trackingNumber: { $exists: true, $ne: "" }
        });

        return { statusCode: 200, headers, body: JSON.stringify({ count, returns, waybills }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: `Endpoint ${path} not found` }) };

  } catch (error: any) {
    console.error('API Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || "Internal Cluster Error" }) };
  }
};
