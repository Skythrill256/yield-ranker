# Backend API Requirements for ETF Data Upload

## Overview
This document outlines the backend API endpoint requirements for the ETF Data Management upload functionality in the Dashboard.

## API Endpoint Specification

### Endpoint: Upload ETF Data
**URL**: `/api/admin/upload-dtr`  
**Method**: `POST`  
**Content-Type**: `multipart/form-data`  
**Authentication**: Required (Admin only)

### Request

**Form Data**:
- `file`: Excel file (.xlsx format)

### Response

**Success Response** (200 OK):
```json
{
  "success": true,
  "count": 45,
  "message": "Successfully processed 45 ETFs"
}
```

**Error Response** (400/500):
```json
{
  "error": "Error message describing what went wrong",
  "details": "Optional additional error details"
}
```

## Backend Implementation Requirements

### 1. File Upload Handler

```javascript
// Example using Express.js with multer
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed'));
    }
  }
});

router.post('/api/admin/upload-dtr', 
  authenticateAdmin, // Your admin authentication middleware
  upload.single('file'), 
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Parse Excel file
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      // Process and save ETF data
      const processedCount = await processETFData(data);

      res.json({
        success: true,
        count: processedCount,
        message: `Successfully processed ${processedCount} ETFs`
      });

    } catch (error) {
      console.error('ETF upload error:', error);
      res.status(500).json({ 
        error: 'Failed to process ETF data',
        details: error.message 
      });
    }
  }
);
```

### 2. Excel Data Processing Function

```javascript
async function processETFData(excelData) {
  let processedCount = 0;

  for (const row of excelData) {
    try {
      // Map Excel columns to database fields
      const etfData = {
        symbol: row['Symbol'] || row['SYMBOL'],
        name: row['Name'] || row['NAME'],
        issuer: row['Issuer'] || row['ISSUER'],
        description: row['Description'] || row['DESCRIPTION'],
        payDay: row['Pay Day'] || row['PAY_DAY'],
        ipoPrice: parseFloat(row['IPO Price'] || row['IPO_PRICE']) || 0,
        price: parseFloat(row['Current Price'] || row['PRICE']) || 0,
        priceChange: parseFloat(row['Price Change'] || row['PRICE_CHANGE']) || 0,
        dividend: parseFloat(row['Dividend'] || row['DIVIDEND']) || 0,
        numPayments: parseInt(row['# Payments'] || row['NUM_PAYMENTS']) || 0,
        annualDividend: parseFloat(row['Annual Dividend'] || row['ANNUAL_DIVIDEND']) || 0,
        forwardYield: parseFloat(row['Forward Yield'] || row['FORWARD_YIELD']) || 0,
        standardDeviation: parseFloat(row['Standard Deviation'] || row['STD_DEV']) || 0,
        totalReturn1Wk: parseFloat(row['1 Wk Total Return'] || row['TOTAL_RETURN_1WK']) || 0,
        totalReturn1Mo: parseFloat(row['1 Mo Total Return'] || row['TOTAL_RETURN_1MO']) || 0,
        totalReturn3Mo: parseFloat(row['3 Mo Total Return'] || row['TOTAL_RETURN_3MO']) || 0,
        totalReturn6Mo: parseFloat(row['6 Mo Total Return'] || row['TOTAL_RETURN_6MO']) || 0,
        totalReturn12Mo: parseFloat(row['12 Mo Total Return'] || row['TOTAL_RETURN_12MO']) || 0,
        totalReturn3Yr: parseFloat(row['3 Yr Total Return'] || row['TOTAL_RETURN_3YR']) || 0,
        week52Low: parseFloat(row['52 Week Low'] || row['WEEK_52_LOW']) || 0,
        week52High: parseFloat(row['52 Week High'] || row['WEEK_52_HIGH']) || 0,
        updatedAt: new Date()
      };

      // Upsert (update if exists, insert if new)
      await db.etfs.upsert({
        where: { symbol: etfData.symbol },
        update: etfData,
        create: etfData
      });

      processedCount++;
    } catch (error) {
      console.error(`Error processing row for ${row['Symbol']}:`, error);
      // Continue processing other rows
    }
  }

  return processedCount;
}
```

### 3. Authentication Middleware

```javascript
async function authenticateAdmin(req, res, next) {
  try {
    // Your authentication logic here
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token and check if user is admin
    const user = await verifyToken(token);
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid authentication' });
  }
}
```

## Expected Excel File Format

The Excel file should have a header row with the following columns (column names are case-insensitive):

| Column Name | Type | Required | Description |
|------------|------|----------|-------------|
| Symbol | String | Yes | ETF ticker symbol (e.g., "JEPI") |
| Name | String | Yes | Full ETF name |
| Issuer | String | No | Fund issuer/company |
| Description | String | No | ETF description |
| Pay Day | String | No | Payment day of month |
| IPO Price | Number | No | Initial offering price |
| Current Price/Price | Number | Yes | Current market price |
| Price Change | Number | No | Recent price change |
| Dividend | Number | No | Last dividend amount |
| # Payments | Number | No | Number of payments per year |
| Annual Dividend | Number | No | Total annual dividend |
| Forward Yield | Number | No | Forward yield percentage |
| Standard Deviation/Std Dev | Number | No | Dividend volatility |
| 1 Wk Total Return | Number | No | 1 week total return % |
| 1 Mo Total Return | Number | No | 1 month total return % |
| 3 Mo Total Return | Number | No | 3 month total return % |
| 6 Mo Total Return | Number | No | 6 month total return % |
| 12 Mo Total Return | Number | No | 12 month total return % |
| 3 Yr Total Return | Number | No | 3 year total return % |
| 52 Week Low | Number | No | 52-week low price |
| 52 Week High | Number | No | 52-week high price |

### Example Excel Data

```
Symbol | Name                    | Current Price | Forward Yield | 12 Mo Total Return
JEPI   | JPMorgan Equity Premium | 55.23        | 7.24         | 12.5
JEPQ   | JPMorgan Nasdaq ETF     | 52.18        | 9.15         | 15.2
DIVO   | Amplify CWP Enhanced    | 43.67        | 5.12         | 8.3
```

## Database Schema Requirements

Ensure your database has an `etfs` table with the following fields:

```sql
CREATE TABLE etfs (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  issuer VARCHAR(100),
  description TEXT,
  pay_day VARCHAR(50),
  ipo_price DECIMAL(10, 2),
  price DECIMAL(10, 2),
  price_change DECIMAL(10, 2),
  dividend DECIMAL(10, 4),
  num_payments INTEGER,
  annual_dividend DECIMAL(10, 2),
  forward_yield DECIMAL(10, 2),
  standard_deviation DECIMAL(10, 4),
  total_return_1_wk DECIMAL(10, 2),
  total_return_1_mo DECIMAL(10, 2),
  total_return_3_mo DECIMAL(10, 2),
  total_return_6_mo DECIMAL(10, 2),
  total_return_12_mo DECIMAL(10, 2),
  total_return_3_yr DECIMAL(10, 2),
  week_52_low DECIMAL(10, 2),
  week_52_high DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_symbol (symbol),
  INDEX idx_forward_yield (forward_yield),
  INDEX idx_total_return_12_mo (total_return_12_mo)
);
```

## Security Considerations

1. **File Size Limit**: Restrict uploaded files to a reasonable size (e.g., 10MB)
2. **File Type Validation**: Only accept .xlsx files
3. **Authentication**: Verify user is authenticated and has admin role
4. **Rate Limiting**: Implement rate limiting on this endpoint
5. **Error Handling**: Return detailed errors for debugging but don't expose sensitive server info
6. **Logging**: Log all upload attempts (success/failure) with user info for audit trail

## Testing the Endpoint

```bash
# Using curl
curl -X POST http://localhost:4000/api/admin/upload-dtr \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@/path/to/etf-data.xlsx"

# Expected successful response:
{
  "success": true,
  "count": 45,
  "message": "Successfully processed 45 ETFs"
}
```

## Frontend Integration

The frontend sends the file like this:

```typescript
const formData = new FormData();
formData.append('file', uploadFile); // uploadFile is from input[type="file"]

const response = await fetch(`${API_BASE_URL}/api/admin/upload-dtr`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}` // Include if needed
  },
  body: formData
});

const result = await response.json();
```

## Environment Variables

Make sure to set:

```env
# Frontend .env
VITE_API_URL=http://localhost:4000

# Backend .env
PORT=4000
DATABASE_URL=your_database_connection_string
MAX_FILE_SIZE=10485760
```

---

## Implementation Checklist

- [ ] Set up multer for file uploads
- [ ] Install xlsx package: `npm install xlsx`
- [ ] Create `/api/admin/upload-dtr` endpoint
- [ ] Add admin authentication middleware
- [ ] Implement Excel parsing logic
- [ ] Create processETFData function
- [ ] Set up database upsert logic
- [ ] Add error handling and logging
- [ ] Test with sample Excel file
- [ ] Add rate limiting
- [ ] Deploy and test with frontend





