const { google } = require('googleapis');
require('dotenv').config();

const drive = google.drive({ version: 'v3', auth: process.env.GEMINI_API_KEY });
drive.files.list({
  q: "'1M6qdcTlfx_PofE0FkpZMTVibaXvuZEV_' in parents",
  fields: 'files(id, name, mimeType)'
}).then(res => {
  console.log('Success:', res.data.files);
}).catch(err => {
  console.error('Error:', err.message);
});
