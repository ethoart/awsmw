
import { Handler } from '@netlify/functions';
import { MongoClient, ServerApiVersion } from 'mongodb';

const CENTRAL_URI = process.env.MONGODB_URI;
const CENTRAL_DB_NAME = 'milkyway_central';

let cachedCentralClient: MongoClient | null = null;
const tenantClients = new Map<string, MongoClient>();

async function getConnectedClient(uri: string) {
  if (uri === CENTRAL_URI && cachedCentralClient) return cachedCentralClient;
  if (tenantClients.has(uri)) return tenantClients.get(uri)!;
  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    maxPoolSize: 10,
    minPoolSize: 2,
    connectTimeoutMS: 5000,
  });
  await client.connect();
  if (uri === CENTRAL_URI) cachedCentralClient = client;
  else tenantClients.set(uri, client);
  return client;
}

export const handler: Handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const apiPrefix = '/.netlify/functions/api';
  let path = event.path.replace(apiPrefix, '').replace('/api', '') || '/';
  if (!path.startsWith('/')) path = '/' + path;
  const method = event.httpMethod;

  try {
    if (!CENTRAL_URI) throw new Error('MONGODB_URI is not defined.');
    const centralClient = await getConnectedClient(CENTRAL_URI);
    const centralDb = centralClient.db(CENTRAL_DB_NAME);
    const usersCol = centralDb.collection('users');
    const tenantsCol = centralDb.collection('tenants');
    const citiesCol = centralDb.collection('global_cities');

    if (path === '/health') return { statusCode: 200, headers, body: JSON.stringify({ status: 'connected' }) };

    if (path === '/cities') {
      if (method === 'GET') {
        const cityDoc = await citiesCol.findOne({ id: 'master_list' });
        return { statusCode: 200, headers, body: JSON.stringify({ cities: cityDoc?.cities || [] }) };
      }
      if (method === 'POST') {
        const { cities } = JSON.parse(event.body || '{}');
        await citiesCol.updateOne({ id: 'master_list' }, { $set: { cities } }, { upsert: true });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    if (path === '/login' && method === 'POST') {
      const { username, password } = JSON.parse(event.body || '{}');
      const user = await usersCol.findOne({ username, password });
      if (user) return { statusCode: 200, headers, body: JSON.stringify(user) };
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    if (path === '/tenants') {
      if (method === 'GET') return { statusCode: 200, headers, body: JSON.stringify(await tenantsCol.find({}).toArray()) };
      if (method === 'POST' || method === 'PUT') {
        const { tenant, adminUser } = JSON.parse(event.body || '{}');
        await tenantsCol.updateOne({ id: tenant.id }, { $set: tenant }, { upsert: true });
        if (adminUser) await usersCol.updateOne({ tenantId: tenant.id, role: 'SUPER_ADMIN' }, { $set: adminUser }, { upsert: true });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      if (method === 'DELETE') {
        const id = event.queryStringParameters?.id;
        await tenantsCol.deleteOne({ id });
        await usersCol.deleteMany({ tenantId: id });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    if (path === '/users') {
      if (method === 'GET') {
        const tenantId = event.queryStringParameters?.tenantId;
        return { statusCode: 200, headers, body: JSON.stringify(await usersCol.find({ tenantId }).toArray()) };
      }
      if (method === 'POST') {
        const user = JSON.parse(event.body || '{}');
        await usersCol.updateOne({ id: user.id }, { $set: user }, { upsert: true });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      if (method === 'DELETE') {
        const id = event.queryStringParameters?.id;
        await usersCol.deleteOne({ id });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    // SAFE BODY PARSING
    let bodyData = {};
    if (event.body && (method === 'POST' || method === 'PUT')) {
        try { bodyData = JSON.parse(event.body); } catch(e) {}
    }

    // HARDENED TENANT EXTRACTION
    const tenantId = event.queryStringParameters?.tenantId || (bodyData as any).tenantId;
    let activeDb = centralDb;
    let tenantSettings = null;

    if (tenantId) {
      const tenantConfig = await tenantsCol.findOne({ id: tenantId });
      if (tenantConfig) {
        tenantSettings = tenantConfig.settings;
        if (tenantConfig.mongoUri) {
          const tenantClient = await getConnectedClient(tenantConfig.mongoUri);
          activeDb = tenantClient.db();
        }
      }
    }

    if (path === '/orders') {
      const ordersCol = activeDb.collection('orders');
      if (method === 'GET') {
        const id = event.queryStringParameters?.id;
        if (id) return { statusCode: 200, headers, body: JSON.stringify(await ordersCol.findOne({ id })) };

        const page = parseInt(event.queryStringParameters?.page || '1');
        const limit = parseInt(event.queryStringParameters?.limit || '50');
        const search = event.queryStringParameters?.search || '';
        const status = event.queryStringParameters?.status || 'ALL';
        const productId = event.queryStringParameters?.productId;
        const startDate = event.queryStringParameters?.startDate;
        const endDate = event.queryStringParameters?.endDate;

        const query: any = { tenantId };

        if (status !== 'ALL') {
          if (status === 'TODAY_SHIPPED') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query.shippedAt = { $gte: today.toISOString() };
          } else {
            query.status = status;
          }
        }
        if (productId) query['items.productId'] = productId;
        if (startDate || endDate) {
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

        const total = await ordersCol.countDocuments(query);
        const data = await ordersCol.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();

        return { statusCode: 200, headers, body: JSON.stringify({ data, total, page, limit }) };
      }
      if (method === 'POST') {
        const { order, orders } = bodyData as any;
        if (orders) {
          const ops = orders.map((o: any) => ({ updateOne: { filter: { id: o.id }, update: { $set: { ...o, tenantId } }, upsert: true } }));
          await ordersCol.bulkWrite(ops);
        } else if (order) {
          await ordersCol.updateOne({ id: order.id }, { $set: { ...order, tenantId } }, { upsert: true });
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      if (method === 'DELETE') {
        const { id, purge } = event.queryStringParameters || {};
        if (!tenantId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tenant context missing.' }) };

        if (purge === 'true') {
          const result = await ordersCol.deleteMany({ tenantId });
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: result.deletedCount }) };
        }
        if (id) {
          const ids = id.split(',');
          const result = await ordersCol.deleteMany({ id: { $in: ids }, tenantId });
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: result.deletedCount }) };
        }
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing deletion target.' }) };
      }
    }

    if (path === '/products') {
        const productsCol = activeDb.collection('products');
        if (method === 'GET') return { statusCode: 200, headers, body: JSON.stringify(await productsCol.find({ tenantId }).toArray()) };
        if (method === 'POST') {
            const { product } = bodyData as any;
            await productsCol.updateOne({ id: product.id }, { $set: { ...product, tenantId } }, { upsert: true });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        if (method === 'DELETE') {
            const id = event.queryStringParameters?.id;
            await productsCol.deleteOne({ id });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
    }

    if (path === '/ship-order' && method === 'POST') {
        const { order } = bodyData as any;
        const ordersCol = activeDb.collection('orders');
        if (!tenantSettings?.courierApiKey) return { statusCode: 400, headers, body: JSON.stringify({ error: "Courier configuration missing." }) };

        const cleanAmount = Math.round(order.totalAmount).toString();
        const formData = new URLSearchParams();
        formData.append('api_key', tenantSettings.courierApiKey.trim());
        formData.append('client_id', tenantSettings.courierClientId.trim());
        formData.append('order_id', order.id.replace(/\D/g, '').slice(-10));
        formData.append('recipient_name', order.customerName);
        formData.append('recipient_contact_1', order.customerPhone.replace(/\D/g, ''));
        formData.append('recipient_address', order.customerAddress);
        formData.append('recipient_city', order.customerCity || 'Colombo');
        formData.append('amount', cleanAmount);

        const targetUrl = tenantSettings.courierMode === 'EXISTING_WAYBILL' 
          ? 'https://www.fdedomestic.com/api/parcel/existing_waybill_api_v1.php'
          : (tenantSettings.courierApiUrl || 'https://www.fdedomestic.com/api/parcel/new_api_v1.php');

        if (tenantSettings.courierMode === 'EXISTING_WAYBILL') {
            formData.append('waybill_id', (order.trackingNumber || '').toString());
        }

        const response = await fetch(targetUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData 
        });
        
        let data: any;
        try {
            data = await response.json();
        } catch(e) {
            const text = await response.text();
            return { statusCode: 400, headers, body: JSON.stringify({ error: `Courier Error: ${text.slice(0, 100)}` }) };
        }

        if (Number(data.status) === 200) {
            const updated = { 
                ...order, 
                status: 'SHIPPED', 
                trackingNumber: data.waybill_no || order.trackingNumber, 
                shippedAt: new Date().toISOString(),
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'Logistics Handshake: Successful Waybill Assigned', timestamp: new Date().toISOString(), user: 'OMS Connector' }]
            };
            await ordersCol.updateOne({ id: order.id }, { $set: updated });
            return { statusCode: 200, headers, body: JSON.stringify(updated) };
        }
        return { statusCode: 400, headers, body: JSON.stringify({ error: data.message || 'Handshake failed' }) };
    }

    if (path === '/process-return' && method === 'POST') {
        const { trackingOrId } = bodyData as any;
        const ordersCol = activeDb.collection('orders');
        const order = await ordersCol.findOne({ $or: [{ id: trackingOrId }, { trackingNumber: trackingOrId }] });
        if (order) {
            const updated = { ...order, status: 'RETURN_COMPLETED' };
            await ordersCol.updateOne({ id: order.id }, { $set: updated });
            return { statusCode: 200, headers, body: JSON.stringify(updated) };
        }
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reference ID not matched.' }) };
    }

    if (path === '/customer-history-detailed' && method === 'GET') {
        const { phone } = event.queryStringParameters || {};
        if (!phone) return { statusCode: 200, headers, body: JSON.stringify([]) };
        const last8 = phone.slice(-8);
        const all = await activeDb.collection('orders').find({ customerPhone: { $regex: last8 + "$" } }).sort({ createdAt: -1 }).toArray();
        return { statusCode: 200, headers, body: JSON.stringify(all) };
    }

    if (path === '/customer-history' && method === 'GET') {
        const { phone } = event.queryStringParameters || {};
        if (!phone) return { statusCode: 200, headers, body: JSON.stringify({ count: 0, returns: 0 }) };
        const last8 = phone.slice(-8);
        const count = await activeDb.collection('orders').countDocuments({ customerPhone: { $regex: last8 + "$" } });
        const returns = await activeDb.collection('orders').countDocuments({ 
            customerPhone: { $regex: last8 + "$" }, 
            status: { $in: ['RETURNED', 'REJECTED', 'RETURN_COMPLETED'] } 
        });
        return { statusCode: 200, headers, body: JSON.stringify({ count, returns }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Path not found' }) };
  } catch (error: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
