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

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Web Push configuration
webpush.setVapidDetails(
  `mailto:hello@speedsafe.au`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/appointments', async (req, res) => {
  try {
    const bookings = await getSquareAppointments();
    
    const appointments = bookings.map((b, idx) => ({
      id: b.id || idx,
      time: new Date(b.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      customer: b.customer_note || 'Customer',
      address: b.location_id || 'TBD',
      service: b.service_option_id || 'Service',
      price: `$${(Math.random() * 300).toFixed(0)}`,
      eta: `${Math.floor(Math.random() * 30) + 10} min`,
      leaveTime: new Date(Date.now() - 20 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/track-location', async (req, res) => {
  try {
    const { workerId, lat, lng, accuracy } = req.body;

    const { data, error } = await supabase
      .from('worker_locations')
      .insert([{ worker_id: workerId, lat, lng, accuracy, timestamp: new Date() }]);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/team-locations', async (req, res) => {
  try {
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
