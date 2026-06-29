# SpeedSafe Dispatch PWA

Personal job dispatch app that pulls your daily schedule from Google Calendar and shows route timing between jobs.

## Features

- **Google Calendar Integration**: Real-time sync of your daily jobs
- **GPS Tracking**: Track your current location throughout the day
- **Route Timing**: See how long until your next job and when to leave
- **Automatic Location Extraction**: Pulls addresses from calendar events
- **Push Notifications**: 15-minute leaving reminders before each job
- **Route Optimization**: Mapbox integration for optimal routing
- **Offline Support**: Service Worker caching for offline functionality
- **Progressive Web App**: Install on home screen (iOS/Android)
- **Dark Theme**: Professional dark UI with electric blue accents

## Tech Stack

- **Frontend**: React 18 (CDN), PWA, Service Worker
- **Backend**: Node.js/Express
- **APIs**: Google Calendar API, Mapbox Directions/Matrix, Web Push

## Quick Start

### 1. Setup

```bash
npm install
```

### 2. Configure Google Calendar

Follow the [Google Calendar Setup Guide](./SETUP_GOOGLE_CALENDAR.md) to:
1. Create a Google Cloud project
2. Enable Calendar API
3. Get OAuth 2.0 credentials

### 3. Create `.env` file

```
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

MAPBOX_TOKEN=your_mapbox_token

PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5000
```

**Note**: Google Client ID/Secret are required. Mapbox is optional but recommended for ETA calculations.

### 4. Run Locally

```bash
npm start
```

Visit `http://localhost:5000`

Click "📅 Connect Google Calendar" and sign in with your Google account.

### 5. Deploy to Vercel

```bash
git push origin main
```

Vercel auto-deploys. Add these environment variables in Vercel dashboard:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`  
- `GOOGLE_REDIRECT_URI=https://your-vercel-domain.com/auth/google/callback`
- `MAPBOX_TOKEN` (optional)

## Demo Mode

For testing without Google Calendar:
- Email: `worker@speedsafe.au`
- Password: `password`

Shows hardcoded sample jobs.

## API Routes

### Authentication
- `GET /auth/google` - Start Google OAuth flow
- `GET /auth/google/callback` - OAuth callback handler
- `GET /auth/status` - Check authentication status

### Jobs & Scheduling
- `GET /api/health` - Health check
- `GET /api/appointments` - Get today's calendar events
- `POST /api/location` - Log current GPS location
- `POST /api/track-location` - Alternate location endpoint

## How It Works

1. **Connect your Google Calendar** - OAuth login pulls your account
2. **Calendar syncs** - App fetches today's events automatically
3. **Locations extracted** - Addresses pulled from event Location field
4. **Route timing calculated** - Time to next job based on current location
5. **GPS tracking** - Your location updated every 5 seconds
6. **Reminders sent** - Push notification 15 min before leaving for next job

## Performance

- **First Load**: < 2s
- **Calendar Sync**: < 1s
- **GPS Update Frequency**: Every 5 seconds
- **Push Notification Latency**: < 1s
- **Offline**: Full app shell cached

## Mobile Support

- iOS 16+
- Android 7+
- PWA installable on home screen

## Troubleshooting

**Calendar events not showing?**
- Make sure events have a Location field or address in description
- Events must be today's date
- Verify Google Calendar permissions granted

**ETA not calculating?**
- Add Mapbox token to environment variables
- Ensure events have complete addresses

See [SETUP_GOOGLE_CALENDAR.md](./SETUP_GOOGLE_CALENDAR.md) for full setup instructions.

## License

Proprietary
