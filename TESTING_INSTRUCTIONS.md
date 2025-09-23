# ShopDelta Analytics - Testing Instructions

## Testing Instructions

Any additional information to help us successfully test the full app.

### DO

- **Provide step-by-step instructions**
- **Use bullet points or numbered steps**
- **Provide any app-specific settings**
- **Be concise and clear**

### DON'T

- **Submit a long block of text**

---

## Instruction Notes

### Example:

To test this app:

1. **Install the app** in your Shopify development store
2. **Navigate to the app** from your Shopify admin panel
3. **Grant necessary permissions** when prompted (read_orders, read_products)
4. **Wait for initial data sync** (may take a few moments for stores with many orders)

### Core Features to Test:

#### 1. Home Page (`/app`)
- Verify the landing page loads with gradient hero section
- Check that navigation links work properly
- Test "Start Analyzing Your Data" button redirects to analytics

#### 2. Analytics Dashboard (`/app/analytics`)
- **Date Range Selection**: Test different presets (Last 7 days, This Month, Last Month, YTD)
- **Custom Date Range**: Use the date pickers to select custom start/end dates
- **Granularity Options**: Switch between Day, Week, and Month views
- **View Toggle**: Switch between Chart and Table views
- **Comparison Features**: 
  - Enable Month-over-Month comparison
  - Test Year-over-Year comparison
  - Verify delta calculations and percentage changes

#### 3. Export Functionality
- Click the "Export to Excel" button
- Verify the Excel file downloads successfully
- Check that exported data matches displayed analytics
- Test export with different date ranges and comparison modes

#### 4. Demo Store (`/app/demo`)
- Verify mock data displays correctly
- Check all metrics cards show proper formatting
- Test product comparison table functionality
- Verify responsive design on different screen sizes

#### 5. Privacy Policy (`/app/privacy`)
- Ensure all sections load properly
- Verify contact information is displayed
- Check that the policy is comprehensive and readable

### Data Requirements:

- **Minimum Orders**: App works best with at least 10-20 orders for meaningful analytics
- **Date Range**: Orders should span multiple days/weeks for trend analysis
- **Product Variety**: Multiple products help showcase product-level analytics

### Expected Behavior:

- **Loading States**: Spinner should appear while fetching data
- **Error Handling**: Graceful error messages for API failures
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Updates**: Data refreshes when filters change
- **Currency Display**: Amounts shown in store's default currency

### Performance Notes:

- Initial load may take 5-10 seconds for stores with 1000+ orders
- Export functionality may take longer for large date ranges
- Chart rendering optimized for up to 365 data points

### Troubleshooting:

If you encounter issues:

1. **No Data Showing**: Ensure your store has orders within the selected date range
2. **Export Fails**: Check browser console for error details
3. **Slow Loading**: Try reducing the date range or switching to table view
4. **Permission Errors**: Reinstall the app to refresh OAuth tokens

### Browser Compatibility:

- **Chrome**: Fully supported
- **Firefox**: Fully supported  
- **Safari**: Fully supported
- **Edge**: Fully supported

### Mobile Testing:

- Test navigation menu on mobile devices
- Verify charts render properly on small screens
- Check that tables are horizontally scrollable
- Ensure export functionality works on mobile browsers
