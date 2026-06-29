import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import webpush from 'web-push';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Supabase client (optional for development)
let supabase = null;
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );
} else {
  console.warn('⚠️  Supabase not configured. Database features disabled. Configure .env to enable.');
}

// Web Push configuration (optional for development)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:hello@speedsafe.au`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️  Web Push not configured. Push notifications disabled. Configure .env to enable.');
}

// Square API helper
async function getSquareAppointments() {
  try {
    const response = await axios.get(
      `https://connect.squareup.com/v2/bookings/search`,
      {
        headers: { Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}` },
        params: { location_id: process.env.SQUARE_LOCATION_ID }
      }
    );
    return response.data.bookings || [];
  } catch (error) {
    console.error('Square API error:', error.message);
    return [];
  }
}

// Mapbox ETA calculation
async function getETA(fromLat, fromLng, toLat, toLng) {
  try {
    const response = await axios.get(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?access_token=${process.env.MAPBOX_TOKEN}`
    );
    const duration = response.data.routes[0]?.duration || 0;
    return Math.ceil(duration / 60);
  } catch (error) {
    console.error('Mapbox error:', error.message);
    return 0;
  }
}

// Mock users for demo
const DEMO_USERS = {
  'worker@speedsafe.au': { id: 'worker1', name: 'John Technician', role: 'worker' },
  'admin@speedsafe.au': { id: 'admin1', name: 'Admin User', role: 'admin' }
};

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = DEMO_USERS[email];
    if (!user || password !== 'password') {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const bookings = await getSquareAppointments();

    const appointments = bookings.length > 0
      ? bookings.map((b, idx) => ({
          id: b.id || idx,
          time: new Date(b.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          customer: b.customer_note || 'Customer',
          address: b.location_id || 'TBD',
          service: b.service_option_id || 'Service',
          price: b.price || '0',
          eta: '15 min',
          leaveTime: new Date(Date.now() - 20 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }))
      : [
          { id: '1', time: '09:00 AM', customer: 'John Smith', address: '123 Main St', service: 'Installation', price: '$150', eta: '15 min', leaveTime: '08:45 AM' },
          { id: '2', time: '11:30 AM', customer: 'Jane Doe', address: '456 Oak Ave', service: 'Repair', price: '$85', eta: '20 min', leaveTime: '11:10 AM' }
        ];

    res.json({ appointments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/track-location', async (req, res) => {
  try {
    const { worker_id, workerId, lat, lng, accuracy } = req.body;
    const id = workerId || worker_id;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      const { data, error } = await supabase
        .from('worker_locations')
        .insert([{ worker_id: id, lat, lng, accuracy, timestamp: new Date() }]);

      if (error) throw error;
      res.json({ success: true, data });
    } else {
      res.json({ success: true, message: 'Location would be saved to Supabase if configured' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alias for /api/location (frontend compatibility)
app.post('/api/location', async (req, res) => {
  // Forward to /api/track-location
  try {
    const { worker_id, lat, lng, accuracy } = req.body;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      const { data, error } = await supabase
        .from('worker_locations')
        .insert([{ worker_id, lat, lng, accuracy, timestamp: new Date() }]);

      if (error) throw error;
      res.json({ success: true, data });
    } else {
      res.json({ success: true, message: 'Location would be saved to Supabase if configured' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/team-locations', async (req, res) => {
  try {
    if (!supabase) {
      return res.json([]);
    }

    const { data, error } = await supabase
      .from('worker_locations')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscribe-notification', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, message: 'Supabase not configured' });
    }

    const { workerId, subscription } = req.body;

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert([{ worker_id: workerId, subscription }], { onConflict: 'worker_id' });

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-notification', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, message: 'Supabase not configured' });
    }

    const { workerId, title, body } = req.body;

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('worker_id', workerId)
      .single();

    if (error || !data) throw new Error('Worker subscription not found');

    await webpush.sendNotification(data.subscription, JSON.stringify({ title, body }));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/optimize-route', async (req, res) => {
  try {
    const { coordinates } = req.body;
    
    const coords = coordinates.map(c => `${c.lng},${c.lat}`).join(';');
    const response = await axios.get(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${process.env.MAPBOX_TOKEN}`
    );

    res.json(response.data.routes[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync-queue', async (req, res) => {
  try {
    res.json({ synced: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`SpeedSafe Dispatch API listening on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Client URL: ${process.env.CLIENT_URL}`);
});
