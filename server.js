import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ICAL from 'ical.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Calendar ICS Feed
const CALENDAR_ICS_URL = process.env.CALENDAR_ICS_URL;

if (CALENDAR_ICS_URL) {
  console.log('✅ Calendar ICS feed configured');
} else {
  console.warn('⚠️  CALENDAR_ICS_URL not configured. Calendar features disabled.');
}

// Fetch and parse ICS feed
async function fetchCalendarEvents(dateMin, dateMax) {
  if (!CALENDAR_ICS_URL) {
    return [];
  }

  try {
    const response = await axios.get(CALENDAR_ICS_URL);
    const jcal = ICAL.parse(response.data);
    const comp = new ICAL.Component(jcal);
    const events = comp.getAllSubcomponents('vevent');

    const appointments = events
      .map(event => {
        const summary = event.getFirstPropertyValue('summary') || 'Event';
        const description = event.getFirstPropertyValue('description') || '';
        const location = event.getFirstPropertyValue('location') || '';
        const startProp = event.getFirstPropertyValue('dtstart');
        const endProp = event.getFirstPropertyValue('dtend');

        if (!startProp || !endProp) return null;

        const startTime = startProp.toJSDate();
        const endTime = endProp.toJSDate();

        // Filter by date range
        if (startTime > dateMax || endTime < dateMin) {
          return null;
        }

        const duration = Math.round((endTime - startTime) / 60000);

        return {
          id: event.getFirstPropertyValue('uid') || Math.random().toString(),
          date: startTime.toISOString().split('T')[0],
          time: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          title: summary,
          address: location || 'TBD',
          duration: duration > 0 ? `${duration} min` : 'All day',
          eta: '--'
        };
      })
      .filter(Boolean);

    return appointments;
  } catch (error) {
    console.error('ICS feed error:', error.message);
    return [];
  }
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

// Mapbox route calculation
async function getRoute(coordinates) {
  if (!process.env.MAPBOX_TOKEN) {
    // Return mock route if no token
    return {
      distance: Math.random() * 20 + 5,
      duration: Math.random() * 1200 + 300,
      geometry: { coordinates: coordinates }
    };
  }

  try {
    const coordStr = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
    const response = await axios.get(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&access_token=${process.env.MAPBOX_TOKEN}`
    );

    const route = response.data.routes[0];
    return {
      distance: route.distance / 1609.34, // Convert to miles
      duration: route.duration,
      geometry: route.geometry
    };
  } catch (error) {
    console.error('Mapbox error:', error.message);
    return null;
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    calendar: 'ICS Feed',
    configured: !!CALENDAR_ICS_URL
  });
});

app.get('/api/appointments', async (req, res) => {
  try {
    if (!CALENDAR_ICS_URL) {
      return res.status(503).json({ error: 'Calendar ICS feed not configured', appointments: [] });
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

    const appointments = await fetchCalendarEvents(timeMin, timeMax);

    // Calculate ETA between consecutive appointments
    const withEta = appointments.map((apt, idx) => {
      let eta = '--';
      if (idx < appointments.length - 1) {
        const nextTime = new Date(`2000-01-01 ${appointments[idx + 1].time}`);
        const currentEnd = new Date(`2000-01-01 ${apt.endTime}`);
        const timeBetween = Math.round((nextTime - currentEnd) / 60000);
        if (timeBetween > 0) {
          eta = `${timeBetween} min`;
        }
      }
      return { ...apt, eta };
    });

    res.json({ appointments: withEta, view, date: date.toISOString().split('T')[0] });
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

app.post('/api/route', async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to coordinates required' });
    }

    const route = await getRoute([[from.lng, from.lat], [to.lng, to.lat]]);

    if (!route) {
      return res.status(503).json({ error: 'Route calculation unavailable' });
    }

    // Calculate ideal departure time (with 10% buffer)
    const travelTime = Math.ceil(route.duration / 60); // Convert to minutes
    const leaveBuffer = Math.ceil(travelTime * 0.1) + 5; // 10% + 5 min buffer
    const departureTime = new Date();
    departureTime.setMinutes(departureTime.getMinutes() + leaveBuffer);

    res.json({
      distance: route.distance.toFixed(1),
      duration: travelTime,
      leaveAt: departureTime.toISOString(),
      departureMinutes: leaveBuffer,
      geometry: route.geometry
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/optimize-route', async (req, res) => {
  try {
    const { appointments, currentLocation } = req.body;

    if (!appointments || appointments.length === 0) {
      return res.json({ route: null, optimizedOrder: [] });
    }

    // Sort appointments by time (simple optimization - real app would use Mapbox Matrix API)
    const sorted = [...appointments].sort((a, b) => {
      return new Date(`2000-01-01 ${a.time}`) - new Date(`2000-01-01 ${b.time}`);
    });

    // Calculate routes between consecutive jobs
    const routes = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < sorted.length; i++) {
      const from = i === 0 ? currentLocation : sorted[i - 1];
      const to = sorted[i];

      // Use mock coordinates if not available
      const fromCoords = from.coords || [currentLocation.lng || -151.7419, currentLocation.lat || 58.4160];
      const toCoords = to.coords || [
        currentLocation.lng + Math.random() * 0.2,
        currentLocation.lat + Math.random() * 0.2
      ];

      const route = await getRoute([fromCoords, toCoords]);

      if (route) {
        routes.push({
          from: i === 0 ? 'current' : sorted[i - 1].id,
          to: sorted[i].id,
          distance: route.distance,
          duration: Math.ceil(route.duration / 60),
          geometry: route.geometry
        });
        totalDistance += route.distance;
        totalDuration += route.duration / 60;
      }
    }

    res.json({
      optimizedOrder: sorted,
      routes,
      totalDistance: totalDistance.toFixed(1),
      totalDuration: Math.ceil(totalDuration),
      startTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Route optimization error:', error.message);
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
