# AI Event Submission - Testing Guide

## Prerequisites

1. **Environment Variables** - Add to `.env.local`:
```bash
OPENAI_API_KEY=sk-...your-key...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...your-existing-key...
```

2. **Start Development Server**:
```bash
cd dao-app
npm run dev
```

3. **Access the AI Submission Page**:
   - Direct: http://localhost:3000/submit-ai
   - From traditional form: Click "Probiere die KI-gestützte Einreichung"

## Test Scenarios

### ✅ Test 1: Conversational Event Submission

1. Open http://localhost:3000/submit-ai
2. Wait for AI greeting message
3. Type: "Ich möchte ein Konzert einreichen"
4. AI should ask for event title
5. Respond: "Jazz Night am Fluss"
6. AI should ask for date
7. Respond: "Am 15. Juli 2025 um 19:00 Uhr"
8. AI should ask for location
9. Respond: "Oberbaumbrücke, Berlin"
10. AI should verify location with Google Maps
11. Continue providing organizer info when asked
12. AI should summarize and ask for confirmation
13. Confirm submission

**Expected Result**: Event submitted successfully, confirmation screen shown

### ✅ Test 2: Flyer Upload (if you have an event flyer)

1. Open http://localhost:3000/submit-ai
2. Click the upload icon or drag & drop a flyer image
3. AI should analyze the image
4. AI should extract information and show what was found
5. AI should ask if you want to use the flyer as thumbnail
6. AI should ask for missing required fields only
7. Confirm all extracted data
8. Submit

**Expected Result**: Most fields auto-filled, minimal user input needed

### ✅ Test 3: Location Geocoding

Test with various location formats:
- "Alexanderplatz"
- "Rathaus Berlin"
- "Unter den Linden 1, Berlin"
- "Checkpoint Charlie"

**Expected Result**: Each location should be verified and confirmed with formatted address

### ✅ Test 4: Validation

Try invalid inputs:
- Date in the past → AI should reject
- Invalid email → AI should ask again
- Missing required fields → AI should request them

**Expected Result**: AI handles errors gracefully, guides user to correct inputs

### ✅ Test 5: Reset and New Submission

1. Complete a submission
2. Click "Weiteres Event einreichen"
3. Start new conversation

**Expected Result**: Form clears, conversation resets

## Debug Mode

### Check Browser Console

Open DevTools (F12) and check:
- Network tab for API calls to `/api/chat/event-submission`
- Console for any JavaScript errors
- Response streaming should show text chunks

### Check Server Logs

Terminal running `npm run dev` will show:
- "Geocoding location: ..." when searching locations
- "Extracting flyer information..." when processing images
- "Submitting event: ..." when saving to database
- Any errors from OpenAI or Google Maps APIs

## Common Issues & Solutions

### "OpenAI API key is not configured"
**Solution**: Add `OPENAI_API_KEY` to `.env.local`, restart dev server

### "Location not found"
**Solution**: Use more specific addresses, include city name

### Flyer extraction fails
**Solution**:
- Ensure image is clear and readable
- Try with a standard event poster format
- Check OpenAI API has GPT-4o access

### No response from AI
**Solution**:
- Check browser console for errors
- Verify API route at http://localhost:3000/api/chat/event-submission
- Check OpenAI account has credits
- Restart dev server

### Streaming response hangs
**Solution**:
- Check that response is not being blocked by ad blockers
- Verify streaming is supported (most modern browsers)
- Try in incognito mode

## API Cost Monitoring

Each test submission will cost approximately:
- Conversational only: ~$0.005
- With flyer extraction: ~$0.02
- Per location lookup: ~$0.01

Monitor your OpenAI dashboard for usage.

## Sample Test Data

Use this data for consistent testing:

**Event 1 - Music Concert**:
- Title: "Sommerkonzert im Park"
- Date: 2025-07-20
- Time: 19:00
- Location: "Tiergarten, Berlin"
- Organizer: "Berliner Musikverein"
- Email: test@example.com
- Category: Musik

**Event 2 - Sports Event**:
- Title: "Marathon Berlin"
- Date: 2025-09-15
- Time: 09:00
- Location: "Brandenburger Tor"
- Organizer: "Berlin Sports Club"
- Email: sports@example.com
- Category: Sport

## Success Criteria

✅ AI responds in German
✅ Questions are asked one at a time
✅ Locations are geocoded and confirmed
✅ Flyer extraction works (if applicable)
✅ Required fields are validated
✅ Event submits to Supabase with "pending" status
✅ Success screen shows after submission
✅ Can start new submission after success

## Feedback

If you encounter issues or have suggestions:
1. Check the console and server logs
2. Note the exact error message
3. Document the steps to reproduce
4. Check the [AI_EVENT_SUBMISSION_README.md](./AI_EVENT_SUBMISSION_README.md) for troubleshooting

## Next Steps After Testing

Once testing is successful:
1. Set up production environment variables in Vercel
2. Monitor API costs in OpenAI dashboard
3. Review submitted events in admin panel
4. Consider adding analytics to track usage
5. Gather user feedback on the AI experience
