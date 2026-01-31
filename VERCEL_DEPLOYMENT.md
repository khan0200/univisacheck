# Vercel Deployment Instructions

## ✅ What's Been Set Up

Your application is now configured to work with Vercel's serverless functions:

1. **`vercel.json`** - Vercel configuration file that routes API requests
2. **`package.json`** - Node.js project configuration
3. **`api/check-status.js`** - Serverless function that acts as a CORS proxy
4. **`.gitignore`** - Updated to exclude Vercel build files

## 🚀 Deployment Steps

### Option 1: Automatic Deployment (Recommended)

If you've connected your GitHub repository to Vercel:

1. **Push to GitHub** (Already done! ✅)

   ```bash
   git push
   ```

2. **Vercel will automatically deploy** your changes
   - Check your Vercel dashboard: <https://vercel.com/dashboard>
   - Wait for the deployment to complete (usually 1-2 minutes)

### Option 2: Manual Deployment via CLI

If you need to deploy manually:

```bash
vercel --prod
```

## 🔧 Configuration

### Update Your Vercel Domain

If your Vercel domain is different from `visa-sable.vercel.app`, update it in:

**`api/check-status.js`** (line 9):

```javascript
const ALLOWED_ORIGINS = [
    'https://YOUR-ACTUAL-DOMAIN.vercel.app',  // Update this
    'http://localhost:5500',
    // ... rest of origins
];
```

### Environment Variables (if needed)

If you need to add environment variables in Vercel:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add any required variables

## 🧪 Testing

After deployment, test the proxy endpoint:

1. **Check if the API is working:**

   ```bash
   curl https://YOUR-DOMAIN.vercel.app/api/check-status
   ```

2. **Test from your application:**
   - Open your deployed app: `https://YOUR-DOMAIN.vercel.app`
   - Try checking a visa status
   - The app should now work without the "Cannot connect to proxy server" error

## 📝 Local Development

For local development, you still need to run the proxy server:

```bash
node proxy.js
```

The `config.js` file automatically detects if you're running locally and uses:

- **Local**: `http://localhost:3000/check-status`
- **Production**: `/api/check-status` (Vercel serverless function)

## 🔍 Troubleshooting

### Issue: "Cannot connect to proxy server" on Vercel

**Solution:**

1. Check Vercel deployment logs for errors
2. Verify the serverless function is deployed correctly
3. Check browser console for CORS errors
4. Ensure your domain is in the `ALLOWED_ORIGINS` list

### Issue: API requests failing

**Solution:**

1. Check Vercel function logs: Dashboard → Your Project → Functions
2. Verify the `visadoctors.uz` API is accessible
3. Test the endpoint directly with curl or Postman

## 📚 Additional Resources

- [Vercel Serverless Functions Documentation](https://vercel.com/docs/functions)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
