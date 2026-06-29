import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import webpush from 'web-push';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { google } from 'googleapis';
import session from 'express-session';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(session({
  secret: 'dispatch-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// Google Calendar OAuth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback'
);

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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

// Google Calendar OAuth Routes
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
  res.json({ authUrl });
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;
    res.redirect('/');
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(400).json({ error: 'Authentication failed' });
  }
});

app.get('/auth/status', (req, res) => {
  const authenticated = !!req.session.tokens;
  res.json({ authenticated, tokens: authenticated ? { access_token: '***' } : null });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/appointments', async (req, res) => {
  try {
    if (!req.session.tokens) {
      return res.status(401).json({ error: 'Not authenticated', appointments: [] });
    }

    oauth2Client.setCredentials(req.session.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      fields: 'items(id,summary,description,start,end,location)'
    });

    const appointments = await Promise.all(
      (data.items || []).map(async (event, idx) => {
        const startTime = new Date(event.start.dateTime || event.start.date);
        const endTime = new Date(event.end.dateTime || event.end.date);

        // Extract location from event (assumes format: "Address" or from description)
        let address = event.location || 'TBD';

        // Try to extract address from description if location is empty
        if (!event.location && event.description) {
          const addressMatch = event.description.match(/(?:Address|Address:|at )([^\n]+)/i);
          if (addressMatch) {
            address = addressMatch[1].trim();
          }
        }

        // Calculate ETA to next appointment if available
        let eta = '--';
        if (idx < (data.items || []).length - 1) {
          const nextEvent = (data.items || [])[idx + 1];
          const nextStartTime = new Date(nextEvent.start.dateTime || nextEvent.start.date);
          const durationMin = Math.round((nextStartTime - endTime) / 60000);
          if (durationMin > 0) {
            eta = `${durationMin} min`;
          }
        }

        const leaveTime = new Date(startTime.getTime() - 15 * 60000); // Leave 15 min before

        return {
          id: event.id,
          time: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          customer: event.summary || 'Appointment',
          address,
          service: endTime.getTime() - startTime.getTime() > 0
            ? `${Math.round((endTime - startTime) / 60000)} min`
            : 'TBD',
          price: 'TBD',
          eta,
          leaveTime: leaveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          location: address // For route optimization
        };
      })
    );

    res.json({ appointments });
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
