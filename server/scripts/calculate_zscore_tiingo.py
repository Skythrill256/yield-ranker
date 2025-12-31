"""
Calculate 3-Year Z-Score for CEFs using Tiingo API
Stores results in PostgreSQL database (via Supabase)

Flexible Lookback Logic:
- Maximum: 3 years (756 trading days)
- Minimum: 1 year (252 trading days)

Installation:
    pip install pandas requests python-dotenv psycopg2-binary

Environment Variables Required:
    TIINGO_API_KEY=your_api_key
    SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_ROLE_KEY=your_service_key
"""

import pandas as pd
import requests
import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

# Load environment variables
load_dotenv()

TIINGO_API_KEY = os.getenv('TIINGO_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not TIINGO_API_KEY:
    raise ValueError("TIINGO_API_KEY environment variable is required")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Supabase credentials are required")


def get_tiingo_prices(ticker, start_date, end_date):
    """
    Fetch EOD price data from Tiingo API
    
    Args:
        ticker: Stock symbol (e.g., 'GAB')
        start_date: Start date as 'YYYY-MM-DD'
        end_date: End date as 'YYYY-MM-DD'
    
    Returns:
        List of dicts with 'date', 'close', 'open', 'high', 'low', 'volume'
    """
    url = f"https://api.tiingo.com/tiingo/daily/{ticker}/prices"
    params = {
        'startDate': start_date,
        'endDate': end_date,
        'token': TIINGO_API_KEY
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Convert to list of dicts with standardized keys
        prices = []
        for record in data:
            prices.append({
                'date': record['date'][:10],  # Extract YYYY-MM-DD
                'close': record['close'],
                'open': record.get('open'),
                'high': record.get('high'),
                'low': record.get('low'),
                'volume': record.get('volume'),
            })
        
        return prices
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {ticker}: {e}")
        return []


def calculate_z_score_3yr(price_data, nav_data, current_date_str):
    """
    Calculate 3-Year Z-Score using flexible lookback logic
    
    Logic:
    1. Find most recent date with both price and NAV
    2. Calculate 3-year lookback from that date (exactly 3 years back)
    3. Filter data to that 3-year window
    4. Check minimum threshold: Need at least 252 trading days (1 year)
    5. Calculate Premium/Discount: (Price / NAV) - 1 (as decimal)
    6. Calculate Average P/D (mean)
    7. Calculate STDEV.P (population standard deviation, divide by n)
    8. Calculate Z-Score: (Current P/D - Average) / STDEV.P
    
    Args:
        price_data: List of dicts with 'date' and 'close' keys
        nav_data: List of dicts with 'date' and 'close' keys  
        current_date_str: Current date as 'YYYY-MM-DD'
    
    Returns:
        dict with results or None if insufficient data
    """
    # Convert to DataFrames
    price_df = pd.DataFrame(price_data)
    nav_df = pd.DataFrame(nav_data)
    
    if price_df.empty or nav_df.empty:
        return None
    
    # Merge on date
    merged = pd.merge(price_df, nav_df, on='date', suffixes=('_price', '_nav'))
    
    # Filter to dates where both price and NAV exist and are > 0
    merged = merged[
        (merged['close_price'] > 0) & 
        (merged['close_nav'] > 0)
    ].copy()
    
    if merged.empty:
        return None
    
    # Sort by date
    merged['date'] = pd.to_datetime(merged['date'])
    merged = merged.sort_values('date')
    
    # Find the most recent date with both price and NAV (not future dates)
    current_date = pd.to_datetime(current_date_str)
    available_data = merged[merged['date'] <= current_date].copy()
    
    if available_data.empty:
        return None
    
    # Calculate 3-year lookback date (exactly 3 years from the most recent date)
    actual_end_date = available_data['date'].max()
    three_year_start_date = actual_end_date - pd.DateOffset(years=3)
    
    # Filter to the 3-year window (from 3 years ago to most recent date)
    window_data = available_data[
        (available_data['date'] >= three_year_start_date) & 
        (available_data['date'] <= actual_end_date)
    ].copy()
    
    # Check minimum threshold (1 year = ~252 trading days)
    if len(window_data) < 252:
        return {
            'status': 'insufficient_data',
            'data_points': len(window_data),
            'required': 252
        }
    
    # Calculate Premium/Discount: (Price / NAV) - 1 (as decimal)
    window_data['prem_disc'] = (window_data['close_price'] / window_data['close_nav']) - 1.0
    
    # Get current P/D (most recent date)
    current_pd = window_data['prem_disc'].iloc[-1]
    
    # Calculate average P/D (mean) - using ALL data in the 3-year window
    avg_pd = window_data['prem_disc'].mean()
    
    # Calculate STDEV.P (Population Standard Deviation)
    # Variance = Σ(x - mean)² / n (divide by n, not n-1)
    variance = ((window_data['prem_disc'] - avg_pd) ** 2).sum() / len(window_data)
    stddev_pd = pd.np.sqrt(variance)
    
    if stddev_pd == 0:
        return {
            'z_score': 0.0,
            'current_pd': current_pd,
            'current_pd_pct': current_pd * 100,
            'avg_pd': avg_pd,
            'avg_pd_pct': avg_pd * 100,
            'stddev_pd': stddev_pd,
            'stddev_pd_pct': stddev_pd * 100,
            'data_points': len(window_data),
            'start_date': three_year_start_date.strftime('%Y-%m-%d'),
            'end_date': actual_end_date.strftime('%Y-%m-%d'),
            'status': 'active'
        }
    
    # Calculate Z-Score: (Current - Mean) / StdDev
    z_score = (current_pd - avg_pd) / stddev_pd
    
    return {
        'z_score': z_score,
        'current_pd': current_pd,
        'current_pd_pct': current_pd * 100,
        'avg_pd': avg_pd,
        'avg_pd_pct': avg_pd * 100,
        'stddev_pd': stddev_pd,
        'stddev_pd_pct': stddev_pd * 100,
        'data_points': len(window_data),
        'start_date': three_year_start_date.strftime('%Y-%m-%d'),
        'end_date': actual_end_date.strftime('%Y-%m-%d'),
        'status': 'active'
    }


def fetch_and_store_zscore(ticker, nav_symbol, db_connection):
    """
    Fetch data from Tiingo, calculate Z-Score, and store in database
    
    Args:
        ticker: CEF ticker (e.g., 'GAB')
        nav_symbol: NAV ticker (e.g., 'XGABX')
        db_connection: PostgreSQL connection object
    """
    print(f"\nProcessing {ticker} (NAV: {nav_symbol})...")
    
    try:
        # Define date windows - fetch 4 years to ensure we cover 3-year window fully
        end_date = datetime.now()
        start_date = end_date - timedelta(days=4*365)
        
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')
        current_date_str = end_date_str
        
        print(f"  Fetching price data for {ticker}...")
        price_data = get_tiingo_prices(ticker, start_date_str, end_date_str)
        if not price_data:
            print(f"  ⚠ No price data found for {ticker}")
            return
        
        print(f"  Fetching NAV data for {nav_symbol}...")
        nav_data = get_tiingo_prices(nav_symbol, start_date_str, end_date_str)
        if not nav_data:
            print(f"  ⚠ No NAV data found for {nav_symbol}")
            return
        
        print(f"  ✓ Fetched {len(price_data)} price records, {len(nav_data)} NAV records")
        
        # Calculate Z-Score
        result = calculate_z_score_3yr(price_data, nav_data, current_date_str)
        
        if result is None:
            print(f"  ⚠ Could not calculate Z-Score (no matching dates)")
            return
        
        if result.get('status') == 'insufficient_data':
            print(f"  ⚠ Insufficient data: {result['data_points']} < {result['required']} trading days")
            z_score = None
        else:
            z_score = result['z_score']
            print(f"  ✓ Calculated Z-Score: {z_score:.8f}")
            print(f"    Current P/D: {result['current_pd_pct']:.6f}%")
            print(f"    Average P/D: {result['avg_pd_pct']:.10f}%")
            print(f"    STDEV.P:     {result['stddev_pd_pct']:.10f}%")
            print(f"    Data Points: {result['data_points']} (from {result['start_date']} to {result['end_date']})")
        
        # Store in database
        cursor = db_connection.cursor()
        timestamp = datetime.now().isoformat()
        
        # Update etf_static table with the calculated z-score
        update_query = """
            UPDATE etf_static
            SET five_year_z_score = %s,
                last_updated = %s,
                updated_at = %s
            WHERE ticker = %s
        """
        
        cursor.execute(update_query, (z_score, timestamp, timestamp, ticker.upper()))
        db_connection.commit()
        
        if z_score is not None:
            print(f"  ✓ Saved Z-Score {z_score:.8f} to database")
        else:
            print(f"  ✓ Saved NULL Z-Score to database (insufficient data)")
        
        cursor.close()
        
    except Exception as e:
        print(f"  ❌ Error processing {ticker}: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main function"""
    print("=" * 80)
    print("3-Year Z-Score Calculator (Tiingo API → PostgreSQL)")
    print("=" * 80)
    print()
    print("Flexible Lookback Logic:")
    print("  - Maximum: 3 years (756 trading days)")
    print("  - Minimum: 1 year (252 trading days)")
    print()
    
    # Connect to PostgreSQL (Supabase)
    try:
        # Parse Supabase URL
        # Format: postgresql://postgres:[password]@[host]:5432/postgres
        # Or use Supabase connection string directly
        conn_string = SUPABASE_URL.replace('https://', 'postgresql://postgres:').replace('.supabase.co', '.supabase.co:5432/postgres')
        # Better: Use the service role key in the password
        # Actually, better to use the connection pooler URL if available
        
        # For Supabase, you'll need to construct the connection string properly
        # This is a simplified version - adjust based on your Supabase setup
        db_connection = psycopg2.connect(
            host=os.getenv('SUPABASE_HOST', 'db.xxx.supabase.co'),
            database='postgres',
            user='postgres',
            password=SUPABASE_SERVICE_KEY,
            port=5432
        )
        print("✓ Connected to database")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        print("\nNote: You may need to adjust the connection parameters")
        print("For Supabase, you can use the connection pooler or direct connection")
        return
    
    # Example usage
    # Replace with your actual ticker and NAV symbol pairs
    tickers = [
        ('GAB', 'XGABX'),
        # Add more ticker/nav_symbol pairs here
    ]
    
    for ticker, nav_symbol in tickers:
        fetch_and_store_zscore(ticker, nav_symbol, db_connection)
    
    db_connection.close()
    print("\n✓ Completed")


if __name__ == '__main__':
    main()



