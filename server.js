import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { google } from 'googleapis';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Google Calendar Service Account
let auth = null;
let calendarClient = null;

if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    });
    calendarClient = google.calendar({ version: 'v3', auth });
    console.log('✅ Google Calendar Service Account configured');
  } catch (err) {
    console.error('❌ Failed to parse Google Service Account:', err.message);
  }
} else {
  console.warn('⚠️  Google Service Account not configured. Calendar features disabled.');
}

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

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    calendarEmail: process.env.CALENDAR_EMAIL,
    configured: !!calendarClient
  });
});

app.get('/api/appointments', async (req, res) => {
  try {
    if (!calendarClient) {
      return res.status(503).json({ error: 'Calendar not configured', appointments: [] });
    }

    const view = req.query.view || 'day'; // day, week, month
    const dateStr = req.query.date; // YYYY-MM-DD format, defaults to today

    let date = dateStr ? new Date(dateStr) : new Date();
    date.setHours(0, 0, 0, 0);

    let timeMin, timeMax;
    if (view === 'week') {
      timeMin = new Date(date);
      timeMin.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      timeMax = new Date(timeMin);
      timeMax.setDate(timeMin.getDate() + 7);
    } else if (view === 'month') {
      timeMin = new Date(date.getFullYear(), date.getMonth(), 1);
      timeMax = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    } else {
      // day view (default)
      timeMin = date;
      timeMax = new Date(date);
      timeMax.setDate(date.getDate() + 1);
    }

    const { data } = await calendarClient.events.list({
      calendarId: process.env.CALENDAR_EMAIL || 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      fields: 'items(id,summary,description,start,end,location)'
    });

    const appointments = (data.items || []).map((event, idx, items) => {
      const startTime = new Date(event.start.dateTime || event.start.date);
      const endTime = new Date(event.end.dateTime || event.end.date);
      const duration = Math.round((endTime - startTime) / 60000);

      // Extract location from event
      let address = event.location || 'TBD';
      if (!event.location && event.description) {
        const addressMatch = event.description.match(/(?:Address|Address:|at |Location:)([^\n]+)/i);
        if (addressMatch) {
          address = addressMatch[1].trim();
        }
      }

      // Calculate ETA to next appointment
      let eta = '--';
      if (idx < items.length - 1) {
        const nextEvent = items[idx + 1];
        const nextStartTime = new Date(nextEvent.start.dateTime || nextEvent.start.date);
        const timeBetween = Math.round((nextStartTime - endTime) / 60000);
        if (timeBetween > 0) {
          eta = `${timeBetween} min`;
        }
      }

      const leaveTime = new Date(startTime.getTime() - 15 * 60000);

      return {
        id: event.id,
        date: startTime.toISOString().split('T')[0],
        time: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: event.summary || 'Event',
        address,
        duration: duration > 0 ? `${duration} min` : 'All day',
        eta,
        leaveTime: leaveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });

    res.json({ appointments, view, date: date.toISOString().split('T')[0] });
  } catch (error) {
    console.error('Calendar error:', error.message);
    res.status(500).json({ error: error.message, appointments: [] });
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
