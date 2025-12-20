# Quick Start Guide - Running the Server

## The Issue

The frontend (Vite) is trying to connect to the backend server, but the server isn't running. That's why you see `ECONNREFUSED` errors.

## Solution: Start the Backend Server

### Step 1: Open a New Terminal

Open a **new terminal window** (keep your frontend running in the current terminal).

### Step 2: Start the Backend Server

```bash
cd server
npm run dev
```

You should see:
```
🚀 Server running on 0.0.0.0:4000
```

### Step 3: Verify It's Working

Once the server starts, go back to your browser and refresh the CEF page. The `ECONNREFUSED` errors should stop, and you should see:

- **Server console**: Logs showing Signal and NAV return calculations
- **Browser**: CEF table with Signal and 3/5/10/15Y returns (or N/A if data isn't available)

## About the PowerShell Extension Error

The "PowerShell Extension (19-53)" error is a **VS Code/Cursor extension issue**, not related to your code. You can safely ignore it. It's just the PowerShell extension having a minor issue.

## Port Configuration

- **Frontend (Vite)**: Runs on port `8081`
- **Backend Server**: Runs on port `4000` (or `8080` if PORT env var is set)
- **Vite Proxy**: Forwards `/api/*` requests to `http://localhost:4000`

## Troubleshooting

### If server won't start:
1. Check if port 4000 is already in use
2. Make sure you have a `.env` file in the `server` directory with:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TIINGO_API_KEY`

### If you still see ECONNREFUSED:
1. Make sure the server is actually running (check the terminal)
2. Check that the server is on port 4000 (or set `VITE_API_URL` in your `.env` file)

## Checking Logs

Once the server is running, you'll see logs like:

```
[INFO] [CEF Metrics] Signal +3 (Optimal) for BTO: z=-2.15, t6=5.23%, t12=8.45%
[INFO] [CEF Metrics] ✅ Calculated 5Y NAV return for XDNPX: 45.23%
[INFO] [CEF Metrics] Signal N/A for ABC: missing inputs (zScore=null, ...)
```

These logs will tell you exactly why Signal or returns are N/A for each CEF.

