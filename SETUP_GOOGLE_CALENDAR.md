# SpeedSafe Dispatch - Google Calendar Setup

This guide explains how to set up Google Calendar integration so the app automatically pulls your daily jobs from Google Calendar.

## Prerequisites
- A Google account with access to Google Calendar
- The dispatch app running locally or deployed

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project:
   - Click "Select a Project" → "New Project"
   - Enter project name: `dispatch` or similar
   - Click "Create"

## Step 2: Enable Google Calendar API

1. In Google Cloud Console, search for "Calendar API"
2. Click on "Google Calendar API"
3. Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. In Google Cloud Console, go to "Credentials" (left sidebar)
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Choose "Web application"
4. Under "Authorized redirect URIs", add:
   - `http://localhost:5000/auth/google/callback` (for local development)
   - `https://your-domain.com/auth/google/callback` (for production)
5. Click "Create"
6. Download the credentials JSON or copy the Client ID and Secret

## Step 4: Configure Environment Variables

Create a `.env` file in the dispatch directory (or update existing):

```bash
# Google Calendar API
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

# Mapbox for route optimization (optional)
MAPBOX_TOKEN=your_mapbox_token_here

# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5000
```

## Step 5: Format Your Calendar Events

For the app to work best, format your Google Calendar events with location information:

### Option 1: Use the Location field
When creating an event, fill in the "Location" field with the job address:
- Event: "Customer Installation"
- Location: "123 Main St, Your City"

### Option 2: Include address in description
If you don't use the location field, add the address to the description:
```
Address: 123 Main St, Your City
Additional notes...
```

### Event Duration
- The app shows the duration of each event
- Plan ahead: if a job is 1 hour, set the event end time 1 hour after start

## Step 6: Restart the App

```bash
npm start
```

## Step 7: Login with Google Calendar

1. Open the app in your browser
2. Click "📅 Connect Google Calendar"
3. Sign in with your Google account
4. Grant permission to access your calendar
5. You'll be redirected back to the app with your today's jobs

## What the App Shows

Once connected, the dispatch screen displays:

- **Time**: When the job starts (from calendar event start time)
- **Customer**: Event title from calendar
- **Address**: From the Location field or description
- **Service**: Duration of the job (in minutes)
- **ETA**: Time until the next job (from current location to next address)
- **Leave Time**: When you should leave current location to reach next job (15 min before)
- **Navigate/Call**: Buttons for quick actions

## Troubleshooting

### "Connect Google Calendar" doesn't work
- Ensure your `.env` file has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Restart the app after adding environment variables
- Check that the redirect URI matches exactly in Google Cloud Console

### Calendar events not showing
- Verify events are on today's date
- Make sure events have location information
- Check browser console for errors (F12 → Console tab)

### Location not extracted
- Add a Location field when creating events
- Or add "Address: 123 Main St" in the event description

## Features

✅ Real-time calendar sync
✅ Automatic location extraction
✅ Job duration tracking
✅ Leave time notifications (15 min before next job)
✅ ETA between jobs (requires Mapbox token)
✅ GPS tracking of your current location
✅ Offline support (PWA)

## Privacy

- The app only reads your calendar events for today
- Your location data is stored locally on your device
- No data is sent to external services except Google (for calendar) and Mapbox (for routing)

## Next Steps

1. Add more jobs to your Google Calendar
2. Set up push notifications (optional)
3. Install as PWA on your phone for offline access
4. Connect Mapbox API for automatic ETA calculation
