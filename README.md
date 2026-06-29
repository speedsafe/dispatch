# SpeedSafe Dispatch PWA

Complete GPS tracking and push notification system for field technicians.

## Features

- **Worker Dispatch**: Real-time appointment scheduling with GPS tracking
- **Admin Team View**: Live worker locations and status monitoring
- **Push Notifications**: 15-minute leaving reminders before each appointment
- **Route Optimization**: Mapbox integration for optimal routing
- **Offline Support**: Service Worker caching for offline functionality
- **Progressive Web App**: Install on home screen (iOS/Android)
- **Dark Theme**: Professional dark UI with electric blue accents

## Tech Stack

- **Frontend**: React 18 (CDN), PWA, Service Worker
- **Backend**: Node.js/Express, Socket.io
- **Database**: Supabase (PostgreSQL)
- **APIs**: Square Bookings, Mapbox Directions/Matrix, Web Push

## Quick Start

### 1. Setup

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` with:
```
SQUARE_ACCESS_TOKEN=your_token
SQUARE_LOCATION_ID=your_location
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key
SUPABASE_SECRET_KEY=your_secret
MAPBOX_TOKEN=your_token
VAPID_PUBLIC_KEY=your_public
VAPID_PRIVATE_KEY=your_private
PORT=5000
NODE_ENV=production
CLIENT_URL=https://dispatch.speedsafe.au
```

### 3. Setup Database

Go to Supabase SQL Editor and run:
```sql
CREATE TABLE worker_locations (
  id BIGSERIAL PRIMARY KEY,
  worker_id TEXT NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  accuracy FLOAT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_worker_id ON worker_locations(worker_id);

CREATE TABLE push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  worker_id TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_worker_subscription ON push_subscriptions(worker_id);
```

### 4. Run Locally

```bash
npm start
```

Visit `http://localhost:5000`

### 5. Deploy to Vercel

```bash
git push origin main
```

Vercel auto-deploys. Add env vars in Vercel dashboard.

## Demo Credentials

- **Worker**: worker@speedsafe.au / password
- **Admin**: admin@speedsafe.au / password

## API Routes

- `GET /api/health` - Health check
- `GET /api/appointments` - List worker appointments
- `POST /api/track-location` - Log GPS location
- `GET /api/team-locations` - Get all worker locations
- `POST /api/subscribe-notification` - Register push subscription
- `POST /api/send-notification` - Send push to worker
- `POST /api/optimize-route` - Get optimized route

## Performance

- **First Load**: < 2s
- **GPS Update Frequency**: Every 5 seconds
- **Push Notification Latency**: < 1s
- **Offline**: Full app shell cached

## Mobile Support

- iOS 16+
- Android 7+
- PWA installable on home screen

## Support

Email: hello@speedsafe.au

## License

Proprietary - SpeedSafe Pty Ltd
